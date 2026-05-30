import { DEMAND_CATEGORIES } from './benchmark';

// ==================== Type Definitions ====================

export type MarketSignalLevel = 'none' | 'info' | 'multi_source' | 'confirmed_risk';
export type MarketSourceStatus = 'ok' | 'blocked' | 'form_required' | 'parse_failed' | 'no_report_found' | 'timeout';
export type MarketExtractionMethod = 'html' | 'rss' | 'pdf' | 'manual' | 'fallback_empty';
export type MarketConfidence = 'low' | 'medium' | 'high';
export type MarketReportStatus = 'auto' | 'confirmed' | 'ignored';

export interface MarketReport {
  id: string;
  source: string;
  title: string;
  url: string;
  publishedAt: string;
  fetchedAt: string;
  categoryIds: string[];
  signalLevel: MarketSignalLevel;
  riskTypes: ('lead_time_increase' | 'allocation' | 'price_increase' | 'demand_surge' | 'constrained_supply' | 'geopolitical' | 'lifecycle')[];
  summaryZh: string;
  evidenceText: string;
  confidence: MarketConfidence;
  status: MarketReportStatus;
  extractionMethod: MarketExtractionMethod;
  sourceStatus: MarketSourceStatus;
}

export interface MarketReportSourceResult {
  name: string;
  url: string;
  sourceStatus: MarketSourceStatus;
  reports: MarketReport[];
  error?: string;
  warning?: string;
}

export interface MarketReportsFetchResult {
  reports: MarketReport[];
  sourceResults: MarketReportSourceResult[];
  fetchedAt: string;
  schemaVersion: number;
}

// Schema version for cache invalidation - increment when data structure changes
export const MARKET_REPORTS_SCHEMA_VERSION = 2;

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
  C15: ['fan', 'heat sink', 'thermal', 'power module', '風扇', '散熱', '電源模組']
};

const RISK_KEYWORDS = {
  lead_time_increase: [/lead[- ]time (increase|increasing|extend|stretches|stretch|prolong|trend up)/i, /交期(拉長|延長|增加|變長)/],
  allocation: [/\ballocation\b/i, /配給/, /限量/],
  price_increase: [/(price|pricing) (increase|hike|rise|up|surge)/i, /價格(上漲|調漲|上揚|上調|飆升)/, /漲價/],
  demand_surge: [/demand (surge|spike|increase|boom|growth)/i, /需求(暴增|激增|上升|旺盛)/],
  constrained_supply: [/(constrained|tight|shortage|limited) supply/i, /supply (constraint|tightness)/i, /供貨(吃緊|受限|緊張|短缺)/, /缺料/],
  geopolitical: [/geopolitical/i, /trade war/i, /tariff/i, /地緣政治/, /關稅/, /貿易戰/],
  lifecycle: [/\beol\b/i, /\bnrnd\b/i, /\bobsolete\b/i, /停產/, /生命週期/, /淘汰/]
};

// ==================== Sources ====================

const SOURCES = [
  { name: 'TTI MarketEYE', url: 'https://www.tti.com/content/ttiinc/en/resources/tools.html' },
  { name: 'TTI Lead Time Trends', url: 'https://www.ttieurope.com/content/ttieurope/en/apps/lead-time-trends.html' },
  { name: 'PPSI Electronics', url: 'https://www.ppsi.io/about/articles/electronics-supply-chain-q2-2026' },
  { name: 'Fusion Worldwide', url: 'https://www.fusionww.com/insights/2026-q1-market-intelligence-lead-time-report-what-procurement-teams-need-to-know-now' },
  { name: 'Sourceability Lead Time', url: 'https://sourceability.com/lead-time-report' },
  { name: 'Future Electronics', url: 'https://www.futureelectronics.com/resources/market-conditions-report' },
  { name: 'SiliconExpert Impacts', url: 'https://www.siliconexpert.com/resources/se-impacts/' }
];

// ==================== Content Quality Checks ====================

/** Check if content looks like a real report vs a landing page / form / nav page */
function isLikelyReportContent(text: string): boolean {
  // Too short = probably a landing page or blocked
  if (text.length < 500) return false;

  // Count how many supply chain related terms appear
  const supplyChainTerms = [
    'lead time', 'allocation', 'supply chain', 'shortage', 'inventory',
    'procurement', 'component', 'semiconductor', 'capacitor', 'resistor',
    'connector', 'memory', 'mcu', 'mosfet', 'pmic', 'mlcc',
    '交期', '供應鏈', '缺料', '庫存', '採購', '半導體'
  ];
  const lowerText = text.toLowerCase();
  const matchCount = supplyChainTerms.filter(term => lowerText.includes(term)).length;

  // If fewer than 3 supply chain terms appear, likely not a real report
  if (matchCount < 3) return false;

  // Check for signs of form/login pages
  const formIndicators = [
    'fill out this form', 'enter your email', 'sign up to download',
    'register to access', 'please complete the form', 'submit your details',
    'gated content', 'download the report'
  ];
  const formHits = formIndicators.filter(ind => lowerText.includes(ind)).length;
  if (formHits >= 2) return false;

  return true;
}

// ==================== Fetching ====================

async function fetchWebpageText(url: string): Promise<{ text: string; status: MarketSourceStatus }> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });
    clearTimeout(id);
    if (res.status === 403 || res.status === 401) {
      return { text: '', status: 'blocked' };
    }
    if (!res.ok) {
      return { text: '', status: 'parse_failed' };
    }
    const html = await res.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!text || text.length < 100) {
      return { text: '', status: 'no_report_found' };
    }

    // Check for form-gated content
    const lowerText = text.toLowerCase();
    const formIndicators = ['fill out this form', 'enter your email', 'sign up to download', 'register to access'];
    if (formIndicators.some(ind => lowerText.includes(ind))) {
      return { text, status: 'form_required' };
    }

    if (!isLikelyReportContent(text)) {
      return { text: '', status: 'no_report_found' };
    }

    return { text, status: 'ok' };
  } catch (e: any) {
    clearTimeout(id);
    if (e?.name === 'AbortError') {
      return { text: '', status: 'timeout' };
    }
    console.warn(`[MarketReportFetcher] Fetch failed for ${url}:`, e);
    return { text: '', status: 'parse_failed' };
  }
}

// ==================== Analysis ====================

function analyzeText(text: string, sourceName: string, sourceUrl: string): MarketReport[] {
  const reports: MarketReport[] = [];
  const lowercaseText = text.toLowerCase();
  const now = new Date().toISOString();

  for (const [catId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const matchedKeyword = keywords.find(kw => lowercaseText.includes(kw.toLowerCase()));
    if (!matchedKeyword) continue;

    const riskTypes: MarketReport['riskTypes'] = [];
    const evidenceFragments: string[] = [];

    for (const [riskType, regexes] of Object.entries(RISK_KEYWORDS)) {
      for (const regex of regexes) {
        const match = text.match(regex);
        if (match) {
          riskTypes.push(riskType as MarketReport['riskTypes'][number]);
          // Extract evidence snippet
          const index = text.indexOf(match[0]);
          const start = Math.max(0, index - 80);
          const end = Math.min(text.length, index + match[0].length + 80);
          evidenceFragments.push(`...${text.slice(start, end).trim()}...`);
          break;
        }
      }
    }

    if (riskTypes.length === 0) continue;

    // Proximity-based confidence: category keyword near risk keyword = higher confidence
    let confidence: MarketConfidence = 'low';
    const proximityRegex = new RegExp(
      `(${keywords.join('|')})[\\s\\S]{0,150}(allocation|constrained|shortage|lead[- ]time|price|demand)`,
      'i'
    );
    if (proximityRegex.test(text)) {
      confidence = 'medium';
      // If very close (within 60 chars), high
      const tightRegex = new RegExp(
        `(${keywords.join('|')})[\\s\\S]{0,60}(allocation|constrained|shortage|lead[- ]time)`,
        'i'
      );
      if (tightRegex.test(text)) {
        confidence = 'high';
      }
    }

    // No publishedAt can be determined from HTML scrape => use fetchedAt, force confidence down
    // Since we can't reliably extract publish date from arbitrary HTML, use fetchedAt
    const hasNoPublishDate = true; // HTML scraping cannot determine publish date
    if (hasNoPublishDate && confidence === 'high') {
      confidence = 'medium';
    }

    // Generate Chinese summary
    let summaryZh = `來源頁面提及「${matchedKeyword}」相關供應鏈動態：`;
    if (riskTypes.includes('allocation') || riskTypes.includes('constrained_supply')) {
      summaryZh += '偵測到產能受限或配給相關關鍵字。';
    } else if (riskTypes.includes('lead_time_increase')) {
      summaryZh += '偵測到補貨交期拉長相關關鍵字。';
    } else if (riskTypes.includes('price_increase')) {
      summaryZh += '偵測到市場報價調漲相關關鍵字。';
    } else {
      summaryZh += '偵測到供需波動或地緣政治風險相關關鍵字。';
    }

    reports.push({
      id: `fetch-${sourceName.toLowerCase().replace(/\s+/g, '-')}-${catId}-${Date.now()}`,
      source: sourceName,
      title: `${sourceName} - ${catId} 類別情報偵測`,
      url: sourceUrl,
      publishedAt: now, // Cannot determine real publish date from HTML scrape
      fetchedAt: now,
      categoryIds: [catId],
      signalLevel: 'info', // Auto-scraped = info level only, never confirmed_risk
      riskTypes,
      summaryZh,
      evidenceText: evidenceFragments[0] || `偵測到關鍵字: ${matchedKeyword}`,
      confidence,
      status: 'auto',
      extractionMethod: 'html',
      sourceStatus: 'ok',
    });
  }

  return reports;
}

// ==================== Main Entry Point ====================

export async function fetchAndAnalyzeReports(): Promise<MarketReportsFetchResult> {
  const sourceResults: MarketReportSourceResult[] = [];
  const allReports: MarketReport[] = [];
  const now = new Date().toISOString();

  await Promise.all(SOURCES.map(async (src) => {
    const result: MarketReportSourceResult = {
      name: src.name,
      url: src.url,
      sourceStatus: 'parse_failed',
      reports: [],
    };

    try {
      const { text, status } = await fetchWebpageText(src.url);
      result.sourceStatus = status;

      if (status !== 'ok' || !text) {
        if (status === 'blocked') result.warning = '來源頁面回傳 403/401，可能需要登入或被封鎖。';
        else if (status === 'form_required') result.warning = '來源頁面為表單下載頁，無法直接解析報告內容。';
        else if (status === 'timeout') result.warning = '來源頁面回應逾時 (>8s)。';
        else if (status === 'no_report_found') result.warning = '來源頁面內容過短或非報告類型頁面。';
        else result.warning = '來源頁面解析失敗。';
        sourceResults.push(result);
        return;
      }

      const analyzed = analyzeText(text, src.name, src.url);
      result.reports = analyzed;
      allReports.push(...analyzed);
    } catch (e) {
      result.sourceStatus = 'parse_failed';
      result.error = e instanceof Error ? e.message : '未知錯誤';
    }

    sourceResults.push(result);
  }));

  return {
    reports: allReports,
    sourceResults,
    fetchedAt: now,
    schemaVersion: MARKET_REPORTS_SCHEMA_VERSION,
  };
}

// ==================== Category Signal Calculation ====================

/** Calculate per-category signal level for the matrix.
 *  Rules (情報佐證 mode, NOT risk determination):
 *  - 0 auto sources = 'none' (無情報)
 *  - 1 auto source = 'info' (有情報)
 *  - 2+ auto sources = 'multi_source' (多來源佐證)
 *  - status=confirmed AND signalLevel=confirmed_risk = 'confirmed_risk' (確認風險, admin only)
 */
export function calculateCategoryMarketSignal(
  reports: MarketReport[]
): Record<string, MarketSignalLevel> {
  const result: Record<string, MarketSignalLevel> = {};

  for (const cat of DEMAND_CATEGORIES) {
    result[cat.categoryId] = 'none';
  }

  const catReportMap: Record<string, MarketReport[]> = {};
  for (const rep of reports) {
    for (const catId of rep.categoryIds) {
      if (!catReportMap[catId]) catReportMap[catId] = [];
      catReportMap[catId].push(rep);
    }
  }

  for (const [catId, reps] of Object.entries(catReportMap)) {
    // Check for any confirmed risk first
    const confirmedRisk = reps.find(
      r => r.status === 'confirmed' && r.signalLevel === 'confirmed_risk'
    );
    if (confirmedRisk) {
      result[catId] = 'confirmed_risk';
      continue;
    }

    // Count unique auto sources that have detected something
    const autoReports = reps.filter(r => r.status === 'auto' || r.status === 'confirmed');
    if (autoReports.length === 0) continue;

    const uniqueSources = new Set(autoReports.map(r => r.source));

    if (uniqueSources.size >= 2) {
      result[catId] = 'multi_source';
    } else if (uniqueSources.size === 1) {
      result[catId] = 'info';
    }
  }

  return result;
}
