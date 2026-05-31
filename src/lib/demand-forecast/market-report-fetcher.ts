import { DEMAND_CATEGORIES } from './benchmark';
import { getGenericCache, setGenericCache } from '@/lib/db';
import { MARKET_REPORT_SOURCES, type MarketReportSourceConfig } from './market-report-sources';
import {
  MARKET_REPORTS_SCHEMA_VERSION,
  type MarketReport,
  type MarketReportsFetchResult,
  type SourceFetchResult,
  type SourceStatus,
  type ConfidenceLevel,
  type RiskType,
  type MarketSignalLevel,
} from './market-report-types';

// ==================== Keyword Mappings ====================

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  C01: ['mlcc', 'ceramic capacitor', 'multilayer ceramic', '陶瓷電容', '電容'],
  C02: ['pmic', 'power management', 'regulator', 'power ic', '電源管理', '穩壓'],
  C03: ['mosfet', 'discrete', 'transistor', 'diode', '功率元件', '二極體', '三極體', '分離式'],
  C04: ['dram', 'nand', 'nor', 'flash', 'ddr', 'memory', '記憶體', '閃存'],
  C05: ['mcu', 'microcontroller', 'microprocessor', 'cpu', 'processor', '單晶片', '處理器'],
  C06: ['connector', 'header', 'receptacle', 'socket', 'terminal', '連接器', '端子', '插座'],
  C07: ['crystal', 'oscillator', 'resonator', 'xtal', 'quartz', '石英', '晶體', '振盪器'],
  C08: ['tvs', 'esd', 'varistor', 'protection diode', '靜電', '保護元件', '防護'],
  C09: ['analog', 'op amp', 'sensor', 'converter', 'adc', 'dac', '類比', '感測器'],
  C10: ['interface', 'transceiver', 'rs485', 'can bus', 'driver ic', '介面', '收發器'],
  C11: ['inductor', 'choke', 'coil', 'ferrite', '電感', '扼流圈', '線圈'],
  C12: ['aluminum capacitor', 'polymer capacitor', 'electrolytic', '鋁電容', '電解電容', '固態電容'],
  C13: ['optocoupler', 'isolator', 'photocoupler', 'opto', '光耦', '隔離器'],
  C14: ['ethernet', 'phy', 'switch ic', 'lan', 'networking', '網通', '乙太網路'],
  C15: ['fan', 'heat sink', 'thermal', 'power module', '風扇', '散熱', '電源模組'],
};

const RISK_KEYWORDS: Record<string, RegExp[]> = {
  lead_time_increase: [/lead[- ]time (increase|increasing|extend|stretches|stretch|prolong|trend up)/i, /交期(拉長|延長|增加|變長)/],
  allocation: [/\ballocation\b/i, /配給/, /限量/],
  price_increase: [/(price|pricing) (increase|hike|rise|up|surge)/i, /價格(上漲|調漲|上揚|上調|飆升)/, /漲價/],
  demand_surge: [/demand (surge|spike|increase|boom|growth)/i, /需求(暴增|激增|上升|旺盛)/],
  constrained_supply: [/(constrained|tight|shortage|limited) supply/i, /supply (constraint|tightness)/i, /供貨(吃緊|受限|緊張|短缺)/, /缺料/],
  geopolitical: [/geopolitical/i, /trade war/i, /tariff/i, /地緣政治/, /關稅/, /貿易戰/],
  lifecycle: [/\beol\b/i, /\bnrnd\b/i, /\bobsolete\b/i, /停產/, /生命週期/, /淘汰/],
};

// ==================== Content Quality ====================

function isSubstantiveContent(text: string): boolean {
  if (text.length < 500) return false;
  const supplyChainTerms = [
    'lead time', 'allocation', 'supply chain', 'shortage', 'inventory',
    'procurement', 'component', 'semiconductor', 'capacitor', 'resistor',
    'connector', 'memory', 'mcu', 'mosfet', 'pmic', 'mlcc',
    '交期', '供應鏈', '缺料', '庫存', '採購', '半導體',
  ];
  const lowerText = text.toLowerCase();
  const matchCount = supplyChainTerms.filter(t => lowerText.includes(t)).length;
  return matchCount >= 3;
}

function isGatedOrFormPage(text: string): boolean {
  const lower = text.toLowerCase();
  const indicators = [
    'fill out this form', 'enter your email', 'sign up to download',
    'register to access', 'please complete the form', 'submit your details',
    'gated content', 'download the report', 'request access',
  ];
  return indicators.filter(i => lower.includes(i)).length >= 2;
}

// ==================== Fetching ====================

async function fetchPageText(url: string): Promise<{ text: string; status: SourceStatus; pdfUrl?: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timer);
    if (res.status === 403 || res.status === 401) return { text: '', status: 'blocked' };
    if (!res.ok) return { text: '', status: 'parse_failed' };
    const html = await res.text();

    // 嘗試解析頁面中的第一個 PDF 連結
    let pdfUrl: string | null = null;
    const pdfRegex = /href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi;
    let match;
    while ((match = pdfRegex.exec(html)) !== null) {
      const href = match[1];
      try {
        pdfUrl = new URL(href, url).href;
      } catch {
        pdfUrl = href;
      }
      break;
    }

    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text || text.length < 100) return { text: '', status: 'no_new_report' };
    if (isGatedOrFormPage(text)) return { text, status: 'form_required' };
    if (!isSubstantiveContent(text)) return { text: '', status: 'no_new_report' };
    return { text, status: 'ok', pdfUrl };
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === 'AbortError') return { text: '', status: 'timeout' };
    console.warn(`[MarketFetcher] Fetch failed for ${url}:`, e?.message);
    return { text: '', status: 'parse_failed' };
  }
}

/** Extract links from HTML that look like article URLs */
async function findLatestArticleUrl(listUrl: string, allowedDomains: string[]): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(listUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,*/*;q=0.8',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    // Find article-like links
    const linkRegex = /href=["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    const candidates: string[] = [];
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      // Filter for article-like paths
      if (
        (href.includes('/article') || href.includes('/insight') || href.includes('/blog') ||
         href.includes('/report') || href.includes('/market') || href.includes('/supply-chain') ||
         href.includes('/lead-time') || href.includes('/intelligence')) &&
        !href.includes('#') && !href.includes('mailto:') &&
        allowedDomains.some(d => href.includes(d) || href.startsWith('/'))
      ) {
        // Resolve relative URLs
        let fullUrl = href;
        if (href.startsWith('/')) {
          try {
            const base = new URL(listUrl);
            fullUrl = `${base.origin}${href}`;
          } catch { continue; }
        }
        candidates.push(fullUrl);
      }
    }
    return candidates[0] || null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// ==================== Windowed Analysis ====================

const EVIDENCE_WINDOW = 800; // chars around category keyword to search for risk keywords

function extractSensibleQuote(text: string, matchIndex: number, matchLength: number): string {
  // Go back 180 chars and forward 220 chars to get a larger context (about 400 chars total)
  let start = Math.max(0, matchIndex - 180);
  let end = Math.min(text.length, matchIndex + matchLength + 220);

  // Align start to the beginning of the next word to avoid truncated word (like "gh")
  if (start > 0) {
    const nextSpace = text.indexOf(' ', start);
    if (nextSpace !== -1 && nextSpace < matchIndex) {
      start = nextSpace + 1;
    }
  }

  // Align end to the end of the previous word
  if (end < text.length) {
    const prevSpace = text.lastIndexOf(' ', end);
    if (prevSpace !== -1 && prevSpace > (matchIndex + matchLength)) {
      end = prevSpace;
    }
  }

  let quote = text.slice(start, end).trim();
  
  // Add ellipsis if we trimmed the text
  if (start > 0) quote = '...' + quote;
  if (end < text.length) quote = quote + '...';

  return quote;
}

async function summarizeWithGemini(
  evidenceText: string,
  categoryId: string,
  categoryName: string
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null; // Fallback silently if API key is not configured
  }

  try {
    // 1. Check monthly API budget limit ($5 USD cap)
    const currentMonth = new Date().toISOString().slice(0, 7); // e.g. "2026-05"
    const tracking = (await getGenericCache('gemini_monthly_usage')) || {
      month: currentMonth,
      cost: 0,
      calls: 0,
    };

    // Reset if it's a new month
    if (tracking.month !== currentMonth) {
      tracking.month = currentMonth;
      tracking.cost = 0;
      tracking.calls = 0;
    }

    // $5 USD cap check (or max 4000 calls to be safe)
    if (tracking.cost >= 5.0 || tracking.calls >= 4000) {
      console.warn(
        `[Gemini] Monthly API budget cap of $5 reached ($${tracking.cost.toFixed(4)} USD, ${tracking.calls} calls). Skipping Gemini summary.`
      );
      return null;
    }

    // 2. Call Gemini 2.5 Flash API
    const prompt = `You are a senior electronic component procurement and supply chain analyst.
Read the following market report snippet for the category "${categoryName}" (ID: ${categoryId}):
"${evidenceText}"

Write a concise, 1-sentence summary (between 20 to 45 Chinese characters) in Traditional Chinese explaining the market status, shortages, allocation, or lead time trends.
- The summary MUST be a complete sentence (with subject and verb). Do NOT just output component names or keywords.
- Do NOT write generic greetings or intros. Speak like a professional analyst.
- Output ONLY the summary.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000); // 6s timeout

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          maxOutputTokens: 1000,
          temperature: 0.2
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[Gemini] API error: ${res.status} ${res.statusText}`);
      return null;
    }

    const json = await res.json();
    const summary = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!summary) {
      return null;
    }

    // Clean up summary markdown formatting if any
    const cleanSummary = summary.replace(/[\n\r]+/g, ' ').trim();
    console.log('[Gemini DEBUG] Prompt for ' + categoryName + ':', prompt);
    console.log('[Gemini DEBUG] Output:', cleanSummary);

    // 3. Update monthly usage tracking
    const estimatedInputTokens = Math.ceil((prompt.length + evidenceText.length) / 3.5);
    const estimatedOutputTokens = Math.ceil(cleanSummary.length * 2.5);
    const callCost = (estimatedInputTokens * 0.000075 / 1000) + (estimatedOutputTokens * 0.0003 / 1000);

    tracking.cost = (tracking.cost || 0) + callCost;
    tracking.calls = (tracking.calls || 0) + 1;
    await setGenericCache('gemini_monthly_usage', tracking);

    console.log(`[Gemini] Summary generated successfully. Monthly Cost: $${tracking.cost.toFixed(4)} USD (${tracking.calls} calls).`);

    return cleanSummary;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn('[Gemini] Request timed out after 6 seconds.');
    } else {
      console.error('[Gemini] Failed to generate AI summary:', err.message);
    }
    return null;
  }
}

async function analyzeTextWindowed(text: string, sourceName: string, sourceUrl: string): Promise<MarketReport[]> {
  const reports: MarketReport[] = [];
  const now = new Date().toISOString();
  const lowerText = text.toLowerCase();

  for (const [catId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      const kwLower = keyword.toLowerCase();
      let searchStart = 0;
      let kwIndex: number;

      while ((kwIndex = lowerText.indexOf(kwLower, searchStart)) !== -1) {
        searchStart = kwIndex + kwLower.length;

        // Extract evidence window around this keyword occurrence
        const windowStart = Math.max(0, kwIndex - EVIDENCE_WINDOW / 2);
        const windowEnd = Math.min(text.length, kwIndex + kwLower.length + EVIDENCE_WINDOW / 2);
        const window = text.slice(windowStart, windowEnd);

        // Check for risk keywords within this window
        const riskTypes: RiskType[] = [];
        const evidenceFragments: string[] = [];

        for (const [riskType, regexes] of Object.entries(RISK_KEYWORDS)) {
          for (const regex of regexes) {
            const match = window.match(regex);
            if (match) {
              riskTypes.push(riskType as RiskType);
              const mIdx = window.indexOf(match[0]);
              const absoluteMatchIdx = windowStart + mIdx;
              const quote = extractSensibleQuote(text, absoluteMatchIdx, match[0].length);
              evidenceFragments.push(quote);
              break;
            }
          }
        }

        if (riskTypes.length === 0) continue;

        // Proximity-based confidence: keyword and risk term in same window = at least medium
        let confidence: ConfidenceLevel = 'medium';
        // Check tighter proximity (within 100 chars)
        const tightWindow = text.slice(
          Math.max(0, kwIndex - 50),
          Math.min(text.length, kwIndex + kwLower.length + 100)
        );
        const hasTightMatch = Object.values(RISK_KEYWORDS).flat().some(r => r.test(tightWindow));
        if (hasTightMatch) confidence = 'high';

        // No publishedAt from HTML scrape → null
        let summaryZh = `來源頁面在相近段落中提及「${keyword}」與供應鏈相關風險：`;
        if (riskTypes.includes('allocation') || riskTypes.includes('constrained_supply')) {
          summaryZh += '偵測到產能受限或配給相關關鍵字。';
        } else if (riskTypes.includes('lead_time_increase')) {
          summaryZh += '偵測到補貨交期拉長相關關鍵字。';
        } else if (riskTypes.includes('price_increase')) {
          summaryZh += '偵測到市場報價調漲相關關鍵字。';
        } else {
          summaryZh += '偵測到供需波動或地緣政治風險相關關鍵字。';
        }

        // Deduplicate: check if we already have a report for this source+catId
        const existingIdx = reports.findIndex(
          r => r.source === sourceName && r.categoryIds.includes(catId)
        );
        if (existingIdx !== -1) {
          // Merge risk types
          for (const rt of riskTypes) {
            if (!reports[existingIdx].riskTypes.includes(rt)) {
              reports[existingIdx].riskTypes.push(rt);
            }
          }
          if (confidence === 'high' && reports[existingIdx].confidence !== 'high') {
            reports[existingIdx].confidence = 'high';
          }
          break; // already have entry for this cat, skip to next keyword
        }

        const evidenceTextVal = evidenceFragments[0] || `偵測到關鍵字: ${keyword}`;
        const catNameZh = DEMAND_CATEGORIES.find(c => c.categoryId === catId)?.category || catId;
        const aiSummary = await summarizeWithGemini(evidenceTextVal, catId, catNameZh);

        reports.push({
          id: `auto-${sourceName.toLowerCase().replace(/\s+/g, '-')}-${catId}-${Date.now()}`,
          source: sourceName,
          title: `${sourceName} — ${catId} 類別情報`,
          url: sourceUrl,
          publishedAt: null, // Cannot determine from HTML scrape
          fetchedAt: now,
          categoryIds: [catId],
          signalLevel: 'info',
          riskTypes,
          summaryZh: aiSummary || summaryZh,
          evidenceText: evidenceTextVal,
          confidence,
          status: 'auto',
          extractionMethod: 'html_scrape',
          sourceStatus: 'ok',
          isAiSummary: !!aiSummary,
        });
        break; // found match for this keyword, move to next catId
      }
    }
  }

  return reports;
}

// ==================== Per-Source Fetch ====================

async function fetchSource(config: MarketReportSourceConfig): Promise<SourceFetchResult> {
  const result: SourceFetchResult = {
    sourceId: config.id,
    name: config.name,
    url: config.homepageUrl,
    fetchMode: config.fetchMode,
    sourceStatus: 'parse_failed',
    reports: [],
  };

  // Manual-only / gated form sources
  if (config.fetchMode === 'manual_only') {
    result.sourceStatus = 'manual_required';
    result.warning = `${config.name} 需人工取得報告內容。`;
    return result;
  }
  if (config.fetchMode === 'gated_form') {
    result.sourceStatus = 'manual_required';
    result.warning = `${config.name} 報告需填寫表單下載，建議人工匯入。`;
    return result;
  }

  try {
    let targetUrl: string | null = null;

    if (config.fetchMode === 'article_list' && config.listUrl) {
      // Try to find the latest article from the list page
      targetUrl = await findLatestArticleUrl(config.listUrl, config.allowedDomains || []);
      if (!targetUrl) {
        // Fall back to list page itself
        targetUrl = config.listUrl;
      }
      result.url = targetUrl;
    } else if (config.fetchMode === 'fixed_article' && config.fixedUrl) {
      targetUrl = config.fixedUrl;
      result.url = targetUrl;
    }

    if (!targetUrl) {
      result.sourceStatus = 'parse_failed';
      result.warning = `${config.name} 無可用的抓取 URL。`;
      return result;
    }

    const { text, status, pdfUrl } = await fetchPageText(targetUrl);
    result.sourceStatus = status;
 
    if (status === 'blocked') {
      result.warning = `${config.name} 回傳 403/401，可能需登入或被封鎖。`;
    } else if (status === 'form_required') {
      result.warning = `${config.name} 為表單下載頁，無法直接解析報告內容。`;
    } else if (status === 'timeout') {
      result.warning = `${config.name} 回應逾時 (>8s)。`;
    } else if (status === 'no_new_report') {
      result.warning = `${config.name} 頁面內容過短或非報告類型頁面。`;
    } else if (status === 'parse_failed') {
      result.warning = `${config.name} 頁面解析失敗。`;
    }
 
    if (status !== 'ok' || !text) return result;
 
    const finalUrl = pdfUrl || targetUrl;
    if (pdfUrl) {
      result.url = pdfUrl;
    }
    const analyzed = await analyzeTextWindowed(text, config.name, finalUrl);
    result.reports = analyzed;
  } catch (e) {
    result.sourceStatus = 'parse_failed';
    result.error = e instanceof Error ? e.message : '未知錯誤';
  }

  return result;
}

// ==================== Main Entry Point ====================

export async function fetchAndAnalyzeReports(): Promise<MarketReportsFetchResult> {
  const enabledSources = MARKET_REPORT_SOURCES.filter(s => s.enabled);
  const sourceResults: SourceFetchResult[] = [];
  const allReports: MarketReport[] = [];

  await Promise.all(enabledSources.map(async (config) => {
    const result = await fetchSource(config);
    sourceResults.push(result);
    allReports.push(...result.reports);
  }));

  return {
    reports: allReports,
    sourceResults,
    fetchedAt: new Date().toISOString(),
    schemaVersion: MARKET_REPORTS_SCHEMA_VERSION,
  };
}

// ==================== Category Signal Calculation ====================

export function calculateCategorySignal(
  reports: MarketReport[],
  sourceResults: SourceFetchResult[]
): Record<string, MarketSignalLevel> {
  const result: Record<string, MarketSignalLevel> = {};

  // Check if ALL sources are unavailable
  const hasAnyOkSource = sourceResults.some(sr => sr.sourceStatus === 'ok');

  for (const cat of DEMAND_CATEGORIES) {
    const catId = cat.categoryId;

    if (sourceResults.length > 0 && !hasAnyOkSource) {
      result[catId] = 'source_unavailable';
      continue;
    }

    const catReports = reports.filter(r => r.categoryIds.includes(catId));
    if (catReports.length === 0) {
      result[catId] = 'no_signal';
      continue;
    }

    // Count unique sources
    const uniqueSources = new Set(catReports.map(r => r.source));

    if (uniqueSources.size >= 2) {
      result[catId] = 'multi_source';
    } else if (uniqueSources.size === 1) {
      result[catId] = 'info';
    } else {
      result[catId] = 'no_signal';
    }
  }

  return result;
}
