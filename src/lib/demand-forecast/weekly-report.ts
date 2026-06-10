import fs from 'fs';
import path from 'path';
import { getMarketReportsCache, getGenericCache, setGenericCache, getDemandForecastSnapshotHistory, type SnapshotPoint } from '@/lib/db';
import { DEMAND_CATEGORIES, BENCHMARK_PARTS } from '@/lib/demand-forecast/benchmark';
import crypto from 'crypto';

const NEWS_CACHE_PATH = path.join(process.cwd(), 'data', 'news-cache.json');
const RECENT_SIGNAL_DAYS = 45;
const ARTICLE_FETCH_TIMEOUT_MS = 4500;
const ARTICLE_TEXT_LIMIT = 9000;
const ARTICLE_POINT_LIMIT = 2;

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
};

type WeeklyRiskLevel = 'high' | 'medium' | 'normal';

// 類別層級的「自家快照」週環比訊號（不點名個別料號，只彙總到類別）
export interface CategoryDataSignal {
  partsWithSnapshot: number;   // 該類別中有足夠快照可比的料件數
  stockDrop50: number;         // 庫存週減 ≥50% 的料件數
  stockDrop30: number;         // 庫存週減 ≥30% 的料件數
  priceRise20: number;         // 最低價週漲 ≥20% 的料件數
  priceRise10: number;         // 最低價週漲 ≥10% 的料件數
  supplierDrop: number;        // 供應商家數較上週減少的料件數
  worstStockPct: number | null;// 最深庫存跌幅（負數）
  worstPricePct: number | null;// 最大漲價幅（正數）
  tone: WeeklyRiskLevel;       // 純數據嚴重度
  text: string;                // 類別層級的數據敘述（資料驅動，每週不同）
}

const EMPTY_DATA_SIGNAL: CategoryDataSignal = {
  partsWithSnapshot: 0, stockDrop50: 0, stockDrop30: 0, priceRise20: 0,
  priceRise10: 0, supplierDrop: 0, worstStockPct: null, worstPricePct: null,
  tone: 'normal', text: '',
};

// 找出「上週」對照點：最新點之前、距今 ≥5 天的最近一點；找不到就退而求其次取倒數第二點
function previousWeekPoint(points: SnapshotPoint[]): SnapshotPoint | null {
  if (points.length < 2) return null;
  const latest = points[points.length - 1];
  const latestTime = new Date(latest.date).getTime();
  for (let i = points.length - 2; i >= 0; i--) {
    const gapDays = (latestTime - new Date(points[i].date).getTime()) / 86400000;
    if (gapDays >= 5) return points[i];
  }
  return points[points.length - 2];
}

// 計算單一類別的快照週環比彙總
function computeCategoryDataSignal(
  categoryId: string,
  history: Record<string, SnapshotPoint[]>
): CategoryDataSignal {
  const mpns = BENCHMARK_PARTS.filter((p) => p.categoryId === categoryId).map((p) => p.mpn);
  const signal: CategoryDataSignal = { ...EMPTY_DATA_SIGNAL };

  for (const mpn of mpns) {
    const points = history[mpn];
    if (!points || points.length < 2) continue;
    const latest = points[points.length - 1];
    const prev = previousWeekPoint(points);
    if (!prev) continue;
    signal.partsWithSnapshot += 1;

    // 庫存週環比
    if (prev.totalStock > 0) {
      const stockPct = ((latest.totalStock - prev.totalStock) / prev.totalStock) * 100;
      if (stockPct <= -50) signal.stockDrop50 += 1;
      if (stockPct <= -30) signal.stockDrop30 += 1;
      if (signal.worstStockPct === null || stockPct < signal.worstStockPct) signal.worstStockPct = stockPct;
    }
    // 價格週環比
    if (prev.price != null && latest.price != null && prev.price > 0) {
      const pricePct = ((latest.price - prev.price) / prev.price) * 100;
      if (pricePct >= 20) signal.priceRise20 += 1;
      if (pricePct >= 10) signal.priceRise10 += 1;
      if (signal.worstPricePct === null || pricePct > signal.worstPricePct) signal.worstPricePct = pricePct;
    }
    // 供應商家數減少
    if (prev.supplierCount > latest.supplierCount) signal.supplierDrop += 1;
  }

  signal.tone =
    signal.stockDrop50 > 0 || signal.priceRise20 > 0 || signal.supplierDrop > 0
      ? 'high'
      : signal.stockDrop30 > 0 || signal.priceRise10 > 0
        ? 'medium'
        : 'normal';

  signal.text = buildDataSignalText(categoryId, signal);
  return signal;
}

// 類別層級數據敘述（只講類別與顆數/幅度，不點名個別料號）
function buildDataSignalText(categoryId: string, s: CategoryDataSignal): string {
  if (s.partsWithSnapshot === 0) return '';
  const label = categoryLabel(categoryId);
  const parts: string[] = [];
  if (s.stockDrop30 > 0) {
    const deepest = s.worstStockPct != null ? `（最深 ${Math.round(s.worstStockPct)}%）` : '';
    parts.push(`${s.stockDrop30} 顆庫存週減逾 30%${deepest}`);
  }
  if (s.priceRise10 > 0) {
    const peak = s.worstPricePct != null ? `（最高 +${Math.round(s.worstPricePct)}%）` : '';
    parts.push(`${s.priceRise10} 顆最低價週漲逾 10%${peak}`);
  }
  if (s.supplierDrop > 0) parts.push(`${s.supplierDrop} 顆授權供應商家數減少`);
  if (parts.length === 0) {
    return `${label}：本週監控的 ${s.partsWithSnapshot} 顆料件庫存、價格與供應商家數均無顯著週變動。`;
  }
  return `${label}：本週監控的 ${s.partsWithSnapshot} 顆料件中，${parts.join('、')}。`;
}

const WEEKLY_CATEGORY_LABELS: Record<string, string> = {
  C01: 'MLCC / 積層陶瓷電容',
  C02: 'PMIC / 電源管理 IC',
  C03: 'MOSFET / 功率分離式元件',
  C04: '記憶體 / Flash / DDR',
  C05: 'MCU / 處理器',
  C06: '連接器',
  C07: '晶體 / 振盪器',
  C08: 'TVS / ESD 保護元件',
  C09: '類比 IC / 感測器',
  C10: '介面 IC',
  C11: '電感 / 扼流圈',
  C12: '鋁質 / 固態電容',
  C13: '光耦 / 數位隔離器',
  C14: '乙太網路 / 網通 IC',
  C15: '散熱 / 風扇 / 電源模組',
};

const WEEKLY_CATEGORY_KEYWORDS: Record<string, string[]> = {
  C01: ['mlcc', 'ceramic capacitor', 'capacitor', '積層陶瓷電容', '電容', '高容'],
  C02: ['pmic', 'power management', 'regulator', '電源管理', '穩壓'],
  C03: ['mosfet', 'discrete', 'nexperia', 'infineon', 'onsemi', '功率', '分離式'],
  C04: ['memory', 'ddr', 'dram', 'flash', 'nand', 'hbm', '記憶體', '內存'],
  C05: ['mcu', 'microcontroller', 'processor', '處理器', '微控制器'],
  C06: ['connector', '連接器'],
  C07: ['crystal', 'oscillator', '晶體', '振盪器'],
  C08: ['tvs', 'esd', 'protection', '保護元件'],
  C09: ['analog', 'sensor', 'op amp', '感測器', '類比'],
  C10: ['interface', 'can transceiver', 'rs-485', 'ethernet phy', '介面'],
  C11: ['inductor', 'choke', '電感', '扼流圈'],
  C12: ['aluminum capacitor', 'polymer capacitor', 'electrolytic', '鋁質', '固態電容'],
  C13: ['optocoupler', 'isolator', '光耦', '隔離器'],
  C14: ['ethernet', 'networking', '網通', '乙太網路'],
  C15: ['fan', 'thermal', 'power module', '散熱', '風扇', '電源模組'],
};

export interface WeeklyReportListItem {
  id: string;
  title: string;
  href: string;
  date: string;
}

export interface WeeklyReportDetail extends WeeklyReportListItem {
  generatedAt: string;
  riskLevel: WeeklyRiskLevel;
  summary: string;
  metrics: {
    shortageNews: number;
    lifecycleNews: number;
    marketReports: number;
    watchedCategories: number;
    dataAlertCategories: number;
    partsWithSnapshot: number;
  };
  openingNotes: string[];
  executiveItems: Array<{
    category: string;
    headline: string;
    story: string[];
    suggestedMove: string;
    evidence: string[];
  }>;
  categorySignals: Array<{
    categoryId: string;
    category: string;
    newsCount: number;
    lifecycleCount: number;
    marketReportCount: number;
    tone: WeeklyRiskLevel;
    plainText: string;
    reportNotes: string[];
    data: CategoryDataSignal;
    crossHit: boolean;
  }>;
  newsHighlights: Array<{
    title: string;
    source: string;
    url: string;
    publishedAt: string | null;
    summary: string;
  }>;
  lifecycleHighlights: Array<{
    title: string;
    source: string;
    url: string;
    publishedAt: string | null;
    summary: string;
  }>;
  marketHighlights: Array<{
    title: string;
    source: string;
    url: string;
    publishedAt: string | null;
    summary: string;
  }>;
  sourceLinks: Array<{
    title: string;
    source: string;
    url: string;
    publishedAt: string | null;
    dateLabel: string | null;
    kind: '新聞' | 'PCN/EOL' | '公開報告';
  }>;
  recommendedActions: string[];
}

function readNewsCache() {
  try {
    if (!fs.existsSync(NEWS_CACHE_PATH)) return null;
    return JSON.parse(fs.readFileSync(NEWS_CACHE_PATH, 'utf-8'));
  } catch (err) {
    console.error('[WEEKLY_REPORT] Failed to read news cache:', err);
    return null;
  }
}

function weekStart(date: Date) {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatDateId(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function categoryLabel(categoryId: string, fallback = categoryId) {
  const category = DEMAND_CATEGORIES.find((item) => item.categoryId === categoryId);
  return WEEKLY_CATEGORY_LABELS[categoryId] ?? category?.category ?? fallback;
}

function pickTitle(item: any) {
  return item.titleZh || item.title || '未命名情報';
}

function pickSummary(item: any) {
  return item.snippetZh || item.snippet || item.summaryZh || item.evidenceTextZh || item.evidenceText || '';
}

function cleanEvidenceText(value: string, source = '') {
  return String(value)
    .replace(/\s+/g, ' ')
    .replace(new RegExp(`\\s*-\\s*${source}\\s*$`, 'i'), '')
    .replace(new RegExp(`\\s+${source}\\s*$`, 'i'), '')
    .trim();
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripArticleHtml(html: string) {
  return decodeHtmlEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ARTICLE_TEXT_LIMIT);
}

function splitSentences(text: string) {
  const boilerplatePatterns = [
    /sign in/i,
    /keep me signed in/i,
    /password/i,
    /cookie/i,
    /subscribe/i,
    /newsletter/i,
    /free account/i,
    /premium stories/i,
    /editor picks/i,
    /enable this feature/i,
    /select the box/i,
    /login/i,
    /logout/i,
    /saved information/i,
    /next time you visit/i,
    /登入/,
    /登出/,
    /保持登入/,
    /密碼/,
    /儲存的資訊/,
    /下次造訪/,
    /訂閱/,
    /cookie/i,
  ];
  return text
    .split(/(?<=[。！？.!?])\s+|(?<=。)|(?<=！)|(?<=？)/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence.length >= 35 && sentence.length <= 360)
    .filter((sentence) => !boilerplatePatterns.some((pattern) => pattern.test(sentence)));
}

function sentenceScore(sentence: string, categoryId: string) {
  const lower = sentence.toLowerCase();
  const categoryKeywords = WEEKLY_CATEGORY_KEYWORDS[categoryId] ?? [];
  const riskKeywords = [
    'shortage', 'shortages', 'tight', 'constraint', 'constrained', 'allocation',
    'lead time', 'delivery', 'price', 'cost', 'supply', 'demand', 'inventory',
    '短缺', '吃緊', '供應', '需求', '交期', '成本', '價格', '庫存', '配給',
  ];
  let score = 0;
  for (const keyword of categoryKeywords) {
    if (lower.includes(keyword.toLowerCase())) score += 3;
  }
  for (const keyword of riskKeywords) {
    if (lower.includes(keyword.toLowerCase())) score += 2;
  }
  if (sentence.length >= 60 && sentence.length <= 220) score += 1;
  return score;
}

async function translateTextToZh(text: string) {
  if (!text || /[\u4e00-\u9fff]/.test(text)) return text;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const resp = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-TW&dt=t&q=${encodeURIComponent(text)}`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!resp.ok) return text;
    const data = await resp.json();
    const translated = Array.isArray(data?.[0])
      ? data[0].map((part: any) => part?.[0] || '').join('').trim()
      : '';
    return translated || text;
  } catch {
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchArticlePoints(url: string | undefined, categoryId: string) {
  if (!url || url === '#') return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ARTICLE_FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'follow',
    });
    if (!resp.ok) return [];
    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) return [];
    const text = stripArticleHtml(await resp.text());
    const candidates = splitSentences(text)
      .map((sentence) => ({ sentence, score: sentenceScore(sentence, categoryId) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, ARTICLE_POINT_LIMIT)
      .map((item) => item.sentence);
    const translated = await Promise.all(candidates.map((sentence) => translateTextToZh(sentence)));
    return translated
      .map((sentence) => cleanEvidenceText(sentence))
      .filter(Boolean)
      .filter((sentence) => !/登入|登出|密碼|訂閱|儲存的資訊|下次造訪|cookie|free account|premium stories|editor picks/i.test(sentence));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function dateValue(item: any) {
  const value = item.publishedAt || item.fetchedAt;
  const time = value ? Date.parse(value) : 0;
  return Number.isFinite(time) ? time : 0;
}

function isRecentSignal(item: any, now: Date) {
  const time = dateValue(item);
  if (!time) return true;
  return now.getTime() - time <= RECENT_SIGNAL_DAYS * 24 * 60 * 60 * 1000;
}

async function categoryEvidence(categoryId: string, items: any[], limit = 2) {
  const keywords = WEEKLY_CATEGORY_KEYWORDS[categoryId] ?? [];
  const matched = items
    .filter((item) => {
      if (!item.categoryIds?.includes(categoryId)) return false;
      if (keywords.length === 0) return true;
      const text = `${pickTitle(item)} ${pickSummary(item)}`.toLowerCase();
      return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
    })
    .sort((a, b) => dateValue(b) - dateValue(a))
    .slice(0, limit);

  return Promise.all(matched.map(async (item) => {
      const source = item.source || '來源';
      const title = cleanEvidenceText(pickTitle(item), source);
      const summary = cleanEvidenceText(pickSummary(item), source);
      const articlePoints = await fetchArticlePoints(item.link, categoryId);
      const text = articlePoints.length > 0
        ? articlePoints.join(' ')
        : summary && !title.includes(summary)
          ? `摘要：${summary}`
          : `標題：${title}`;
      return `${source}：${text}`;
    }));
}


async function synthesizeWeeklyReportStoryWithGemini(
  reportId: string,
  categoryId: string,
  categoryName: string,
  data: CategoryDataSignal,
  evidence: string[],
  fallbackStory: string[]
): Promise<string[]> {
  if (evidence.length === 0) {
    return fallbackStory;
  }

  const evidenceHash = crypto.createHash('md5').update(`${data.text}\n${evidence.join('\n')}`).digest('hex');
  const cacheKey = `weekly-report-story-gemini-${reportId}-${categoryId}-${evidenceHash}`;

  try {
    const cached = await getGenericCache(cacheKey);
    if (cached && Array.isArray(cached)) {
      console.log(`[WeeklyReport Gemini] Cache HIT for key: ${cacheKey}`);
      return cached;
    }
  } catch (err) {
    console.warn(`[WeeklyReport Gemini] Failed to read cache for key: ${cacheKey}`, err);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log(`[WeeklyReport Gemini] GEMINI_API_KEY not configured. Using fallback story.`);
    return fallbackStory;
  }

  const currentMonth = new Date().toISOString().slice(0, 7); // e.g. "2026-06"
  const tracking = (await getGenericCache('gemini_monthly_usage')) || {
    month: currentMonth,
    cost: 0,
    calls: 0,
  };

  if (tracking.month !== currentMonth) {
    tracking.month = currentMonth;
    tracking.cost = 0;
    tracking.calls = 0;
  }

  if (tracking.cost >= 5.0 || tracking.calls >= 4000) {
    console.warn(`[WeeklyReport Gemini] Monthly API budget cap reached ($${tracking.cost.toFixed(4)} USD). Skipping Gemini synthesis.`);
    return fallbackStory;
  }

  const evidenceText = evidence.join('\n');
  const prompt = `你是電子零組件採購的供應鏈分析師。針對類別「${categoryName}」（${categoryId}），我們有兩類資訊：

【我方每週實測數據（最重要、必須引用）】
${data.text || '（本週無顯著數據異動）'}

【外部情報佐證】
"${evidenceText}"

任務：寫一段精煉的供應鏈解讀，給採購與 PM 看。

嚴格要求：
1. 必須以「我方實測數據」為主軸開場，並原樣引用上面數據中的具體數字（顆數、百分比）。數據是事實，外部情報只是佐證為什麼會這樣。
2. 總長 80–120 個中文字，只寫一段，不分段、不列點、不下標題。
3. 禁止空泛形容詞堆疊（如「壓力顯著升高」「水溫上升」）與任何沒有數字支撐的宏觀斷言；不要提到本段如何生成之類的 meta 說明。
4. 結尾用一句話點出對「我們公司量產專案 / BOM 成本」的具體影響。
5. 繁體中文輸出，只輸出這段內容本身。`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  
  let attempts = 0;
  const maxAttempts = 2; // 降到 2 次：週報已快取，毋須為單次建構卡太久；失敗就走 data-grounded fallback
  let delayMs = 2000;

  while (attempts < maxAttempts) {
    attempts++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000); // 9s timeout

    try {
      console.log(`[WeeklyReport Gemini] Cache MISS. Invoking Gemini API for category ${categoryName} (Attempt ${attempts}/${maxAttempts})...`);
      
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
            maxOutputTokens: 4096,
            temperature: 0.3,
            thinkingConfig: {
              thinkingBudget: 0
            }
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (res.ok) {
        const json = await res.json();
        const resultText = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (!resultText) {
          return fallbackStory;
        }

        const paragraphs = resultText
          .split(/\n+/)
          .map((p: string) => p.trim())
          .filter(Boolean);

        if (paragraphs.length === 0) {
          return fallbackStory;
        }

        // Update cost tracking
        const estimatedInputTokens = Math.ceil((prompt.length + evidenceText.length) / 3.5);
        const estimatedOutputTokens = Math.ceil(resultText.length * 2.5);
        const callCost = (estimatedInputTokens * 0.000075 / 1000) + (estimatedOutputTokens * 0.0003 / 1000);

        tracking.cost = (tracking.cost || 0) + callCost;
        tracking.calls = (tracking.calls || 0) + 1;
        await setGenericCache('gemini_monthly_usage', tracking);

        try {
          await setGenericCache(cacheKey, paragraphs);
          console.log(`[WeeklyReport Gemini] Cached successfully for key: ${cacheKey}`);
        } catch (err) {
          console.warn(`[WeeklyReport Gemini] Failed to cache generated story for key: ${cacheKey}`, err);
        }

        return paragraphs;
      }

      console.warn(`[WeeklyReport Gemini] API error (Attempt ${attempts}): ${res.status} ${res.statusText}`);
      if (res.status === 429 || res.status >= 500) {
        if (attempts < maxAttempts) {
          const jitter = Math.floor(Math.random() * 2000);
          const sleepMs = delayMs + jitter;
          console.log(`[WeeklyReport Gemini] Retrying in ${sleepMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, sleepMs));
          delayMs *= 2; // 指數倒退 (8000ms)
          continue;
        }
      }
      return fallbackStory;
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        console.warn(`[WeeklyReport Gemini] Request timed out after 12 seconds (Attempt ${attempts}).`);
      } else {
        console.error(`[WeeklyReport Gemini] Error during AI synthesis (Attempt ${attempts}):`, err.message);
      }
      if (attempts < maxAttempts) {
        const jitter = Math.floor(Math.random() * 2000);
        const sleepMs = delayMs + jitter;
        console.log(`[WeeklyReport Gemini] Retrying in ${sleepMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, sleepMs));
        delayMs *= 2;
        continue;
      }
      return fallbackStory;
    }
  }

  return fallbackStory;
}

// 依「實際數據訊號」決定標題與建議動作，不再用硬編碼類別劇本（刀口1）
function dataDrivenHeadline(category: string, d: CategoryDataSignal, lifecycleCount: number, crossHit: boolean): string {
  if (d.stockDrop50 > 0) return `${category}：${d.stockDrop50} 顆料件庫存週減逾 50%${crossHit ? '，外部新聞同步示警' : ''}`;
  if (d.priceRise20 > 0) return `${category}：${d.priceRise20} 顆料件最低價週漲逾 20%${crossHit ? '，外部新聞同步示警' : ''}`;
  if (d.supplierDrop > 0) return `${category}：${d.supplierDrop} 顆料件授權供應商家數減少`;
  if (d.stockDrop30 > 0) return `${category}：${d.stockDrop30} 顆料件庫存週減逾 30%`;
  if (d.priceRise10 > 0) return `${category}：${d.priceRise10} 顆料件最低價週漲逾 10%`;
  if (lifecycleCount > 0) return `${category}：出現 PCN/EOL 生命週期公告，需評估替代方案`;
  return `${category}：出現外部供應警示，列入重點觀察名單`;
}

function dataDrivenSuggestedMove(d: CategoryDataSignal, newsCount: number, lifecycleCount: number, crossHit: boolean): string {
  const moves: string[] = [];
  if (d.stockDrop50 > 0 || d.stockDrop30 > 0) moves.push('請採購對照本類別 BOM 料號，向授權代理商確認未來 4-8 週在途量與可供量');
  if (d.priceRise20 > 0 || d.priceRise10 > 0) moves.push('PM 重新檢視 Forecast 採購預算，並與原廠洽談鎖價或配額');
  if (d.supplierDrop > 0) moves.push('供應商收斂，建議工程端先備妥替代料（Second Source）清單');
  if (lifecycleCount > 0) moves.push('比對 BOM 是否含 PCN/EOL 公告料號，確認最後下單日（LTB）並啟動替代認證');
  if (moves.length === 0) {
    return crossHit
      ? '本週外部新聞示警，建議與通路窗口確認交期走勢並納入追蹤。'
      : '暫無需啟動緊急採購或工程變更，維持例行供應鏈監控即可。';
  }
  return moves.join('；') + '。';
}

async function buildExecutiveItem(
  reportId: string,
  signal: WeeklyReportDetail['categorySignals'][number],
  evidence: string[]
) {
  const category = signal.category;
  const d = signal.data;
  const headline = dataDrivenHeadline(category, d, signal.lifecycleCount, signal.crossHit);
  const suggestedMove = dataDrivenSuggestedMove(d, signal.newsCount, signal.lifecycleCount, signal.crossHit);

  // Gemini 只在「交叉命中」時呼叫（刀口3）：自家數據異動 + 外部新聞同類別佐證。
  // 其餘情況用資料驅動的本地敘述，省 API、也避免空泛文章腔。
  let story: string[];
  if (signal.crossHit && evidence.length > 0) {
    const fallbackStory = dataGroundedFallbackStory(signal);
    story = await synthesizeWeeklyReportStoryWithGemini(reportId, signal.categoryId, category, signal.data, evidence, fallbackStory);
  } else {
    story = dataGroundedFallbackStory(signal);
  }

  return { category, headline, story, suggestedMove, evidence };
}

// 不呼叫 AI 時的本地敘述：用真實數字 + 外部情報筆數，不掰劇本
function dataGroundedFallbackStory(signal: WeeklyReportDetail['categorySignals'][number]): string[] {
  const d = signal.data;
  const out: string[] = [];
  if (d.text) out.push(d.text);
  const ext: string[] = [];
  if (signal.newsCount > 0) ext.push(`${signal.newsCount} 則缺料/交期新聞`);
  if (signal.lifecycleCount > 0) ext.push(`${signal.lifecycleCount} 則 PCN/EOL 公告`);
  if (signal.marketReportCount > 0) ext.push(`${signal.marketReportCount} 份通路報告`);
  if (ext.length > 0) out.push(`外部情報佐證：本週另有 ${ext.join('、')}（詳見下方來源連結）。`);
  if (out.length === 0) out.push('本週此類別僅有零星外部訊號，無自家數據異動，維持例行監控即可。');
  return out;
}

// 類別綜述：先講自家數據（事實），再講外部情報數量（佐證）。不再有硬編碼劇本。
function describeCategorySignal(
  categoryId: string,
  data: CategoryDataSignal,
  newsCount: number,
  lifecycleCount: number,
  marketReportCount: number
) {
  const external: string[] = [];
  if (newsCount > 0) external.push(`${newsCount} 則缺料/交期新聞`);
  if (lifecycleCount > 0) external.push(`${lifecycleCount} 則 PCN/EOL 公告`);
  if (marketReportCount > 0) external.push(`${marketReportCount} 份公開通路報告`);
  const externalText = external.length > 0 ? `外部情報：${external.join('、')}。` : '';

  // 有自家數據異動 → 以數據敘述為主體
  if (data.tone !== 'normal' && data.text) {
    const verdict = (newsCount > 0 || lifecycleCount > 0)
      ? '內部實測與外部新聞同步出現訊號（交叉驗證），建議列為本週優先。'
      : '目前僅內部數據先行示警、外部尚未發酵，屬早期訊號，建議納入追蹤。';
    return `${data.text}${externalText}${verdict}`;
  }

  // 無自家數據異動，只有外部訊號
  if (data.partsWithSnapshot > 0) {
    return `本類別 ${data.partsWithSnapshot} 顆監控料件之庫存與價格本週無顯著變動。${externalText || '外部亦無明顯訊號。'}`;
  }
  // 連快照都還沒累積（資料不足）
  if (external.length === 0) return '本週該類別無明顯外部供應異常訊號，且尚無足夠快照可比對週變動。';
  return `本類別尚無足夠快照可比對週變動。${externalText}建議維持例行監控。`;
}

function reportSummary(report: any) {
  const summary = report.summaryZh || report.evidenceTextZh || report.evidenceText || report.titleZh || report.title || '';
  const cleaned = String(summary).replace(/\s+/g, ' ').trim();
  const text = cleaned.toLowerCase();
  if (text.includes('dram') && text.includes('產能受限')) {
    return '報告提到 DRAM 相關供應有產能受限或配給風險，可能影響記憶體交期與 BOM 成本。';
  }
  if (text.includes('mosfet') && text.includes('產能受限')) {
    return '報告提到 MOSFET 相關供應有產能受限或配給風險，建議先確認常用功率料的通路供應。';
  }
  return cleaned;
}

async function reportEvidence(report: any) {
  const source = report.source || '公開報告';
  const rawText = cleanEvidenceText(report.evidenceTextZh || report.evidenceText || report.summaryZh || report.titleZh || report.title || '公開報告提到此類別');
  const text = await translateTextToZh(rawText);
  return `${source}：${text}`;
}

function categoryReportNotes(categoryId: string, reports: any[]) {
  const matchedReports = reports.filter((report) => report.categoryIds?.includes(categoryId)).slice(0, 3);
  const sourceNames = matchedReports.map((report) => report.source || '公開報告');
  if (matchedReports.length === 0) return [];

  if (categoryId === 'C03') {
    return [
      `${sourceNames.join(' 與 ')} 發布的市場監測均聚焦於 MOSFET。PPSI 著重分析 Nexperia 供應鏈面臨的潛在貿易及關稅壁壘風險；Future Electronics 則指出低壓 MOSFET 通路庫存去化完畢，部分規格已出現供貨配給跡象。`,
      '綜合情報研判，當前雖無全面短缺之虞，但常用功率器件的前置交期已開始拉長，建議專案團隊提早佈署採購排程以策安全。',
    ];
  }

  if (categoryId === 'C04') {
    return [
      `${sourceNames.join(' 與 ')} 指出記憶體市場壓力升高。PPSI 歸因於 AI 硬體需求的爆發性增長對常規產能的排擠；Future Electronics 則預警 DRAM 與 Flash 快閃記憶體即將進入供應分配狀態，導致交期顯著拉長。`,
      '綜合情報研判，短期內記憶體價格與交期波動將傳導至中下游，相關品項之 BOM 成本結構可能面臨調漲壓力，需做好預算鎖定與採購規劃。',
    ];
  }

  if (categoryId === 'C01') {
    return [
      `${sourceNames.join(' 與 ')} 指出高容值 MLCC 的供應鏈緊縮。報告強調，市場目前並非全面短缺，而是小尺寸、高容值及車規級等高端品項之庫存去化速度遠超預期。`,
      '綜合情報研判，熱門規格與高用量 MLCC 將面臨局部配貨，專案團隊應著重核對高風險料號，一般常規低容量電容則維持正常採購流程即可。',
    ];
  }

  return matchedReports.map((report) => {
    const source = report.source || '公開報告';
    const summary = reportSummary(report);
    return summary ? `${source} 報告指出：${summary}` : `${source} 提示本類別供應狀況值得關注。`;
  });
}

function reportCategoryIds(report: any): string[] {
  return Array.isArray(report.categoryIds) ? report.categoryIds : [];
}

function reportCategoryNames(report: any) {
  return reportCategoryIds(report).map((categoryId) => categoryLabel(categoryId)).join('、');
}

function reportNarrative(report: any) {
  const categoryIds = reportCategoryIds(report);
  const source = report.source || '公開報告';
  const sourceText = source.includes('PPSI') ? 'PPSI' : source.includes('Future') ? 'Future' : source;
  if (categoryIds.includes('C04')) {
    if (source.includes('PPSI')) {
      return 'PPSI 報告分析，AI 伺服器的強勁拉貨正持續擠壓常規記憶體產能，DRAM 與 Flash 供應鏈預計將於短期內進入分配狀態，逐步影響終端 BOM 成本與前置交期。';
    }
    return 'Future Electronics 指出，記憶體與快閃記憶體供應緊縮加速，部分晶圓大廠已啟動供貨限制。建議近期有 DDR/DRAM/Flash 需求的專案團隊儘早鎖定產能與報價。';
  }
  if (categoryIds.includes('C01')) {
    return '報告強調 MLCC 短缺並非全面性，而是庫存去化集中於高容值、高壓或車規等高端品項，原廠對此類產能規劃趨於保守，產品團隊需優先審視高用量與特殊規格電容。';
  }
  if (categoryIds.includes('C03')) {
    if (source.includes('PPSI')) {
      return 'PPSI 本期重點分析 MOSFET 市場，指出 Nexperia 供應鏈潛在的貿易政策風險及關稅波動，並警告熱門封裝交期可能受此影響而有所延宕。';
    }
    return 'Future Electronics 監測顯示，低壓 MOSFET 因通路積壓去化且市場需求溫和回升，熱門功率封裝已呈現供貨吃緊跡象，建議採購窗口提早開展備貨對接。';
  }
  if (categoryIds.length > 0) {
    return `${sourceText} 報告主要提及 ${reportCategoryNames(report)} 之供應動態。若相關專案已導入此類別，建議提早與供應商確認交貨排程與庫存保障額度。`;
  }
  return `${sourceText} 報告提供當前市場供應鏈背景趨勢分析。若內容與現有專案 BOM 類別重疊，建議將其作為料號風險管理之參考依據。`;
}

function reportHeadline(report: any) {
  const categoryIds = reportCategoryIds(report);
  if (categoryIds.includes('C04')) {
    return '記憶體產能受限與分配風險增加，建議鎖定交期與成本';
  }
  if (categoryIds.includes('C01')) {
    return '高端高容值 MLCC 庫存去化加速，通路啟動配貨防範';
  }
  if (categoryIds.includes('C03')) {
    return '功率分離式元件（MOSFET）交期波動，常用封裝供應趨緊';
  }
  return report.titleZh || report.title || '公開市場報告提示供應風險異動';
}

function sourceLinkKey(item: { title: string; source: string; url: string }) {
  return item.url && item.url !== '#' ? item.url : `${item.source}-${item.title}`;
}

function uniqueSourceLinks<T extends { title: string; source: string; url: string; kind: '新聞' | 'PCN/EOL' | '公開報告' }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = sourceLinkKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function translatedSourceUrl(url: string) {
  if (!url || url === '#') return '#';
  return `https://translate.google.com/translate?sl=auto&tl=zh-TW&u=${encodeURIComponent(url)}`;
}

function sourceDateLabel(value: string | null | undefined, kind: '新聞' | 'PCN/EOL' | '公開報告') {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const label = kind === '公開報告' ? '報告時間' : kind === 'PCN/EOL' ? 'PCN/EOL 時間' : '新聞時間';
  return `${label} ${formatDate(date)}`;
}

function reportSourceDateLabel(report: any) {
  if (report.publishedAt) {
    const date = new Date(report.publishedAt);
    if (!Number.isNaN(date.getTime())) return `報告日期 ${formatDate(date)}`;
  }
  if (report.fetchedAt) {
    const date = new Date(report.fetchedAt);
    if (!Number.isNaN(date.getTime())) return `報告日期未標示｜擷取日期 ${formatDate(date)}`;
  }
  return '報告日期未標示';
}

function shortCategoryName(label: string) {
  return label.split('/')[0].trim();
}

// 標題依「實際訊號類型」生成，不再用硬編碼類別劇本（與內文一致，避免標題喊緊縮、內文說無異動）
function buildWeeklyTitle(
  dateText: string,
  signals: Array<{ categoryId: string; category: string; tone: WeeklyRiskLevel; newsCount: number; lifecycleCount: number; marketReportCount: number; data: CategoryDataSignal; crossHit: boolean }>
) {
  const primary = signals[0];
  const secondary = signals[1];
  if (!primary) return `物料預測週報｜${dateText}｜本週無明顯供應異常`;

  const catText = secondary
    ? `${shortCategoryName(primary.category)}、${shortCategoryName(secondary.category)}`
    : shortCategoryName(primary.category);

  // 交叉命中：自家數據 + 外部新聞雙重驗證 → 語氣最強
  if (primary.crossHit) {
    return `物料預測週報｜${dateText}｜${catText} 庫存／價格實測異動且外部新聞同步示警，建議優先盤點 4-8 週需求`;
  }
  // 純自家數據異動（外部新聞尚未發酵）
  if (primary.data.tone !== 'normal') {
    if (primary.data.priceRise10 > 0 && primary.data.stockDrop30 === 0) {
      return `物料預測週報｜${dateText}｜${catText} 最低價週環比走揚，建議留意採購成本`;
    }
    if (primary.data.supplierDrop > 0 && primary.data.stockDrop30 === 0 && primary.data.priceRise10 === 0) {
      return `物料預測週報｜${dateText}｜${catText} 授權供應商家數收斂，建議評估替代來源`;
    }
    return `物料預測週報｜${dateText}｜${catText} 庫存週環比下降，內部數據先行示警`;
  }
  // 只有外部新聞、自家數據無異動 → 用語放軟，不誇大
  return `物料預測週報｜${dateText}｜外部新聞提及 ${catText} 等類別，內部數據暫無異動，維持觀察`;
}

const REPORT_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 小時

function currentWeeklyReportId(now = new Date()) {
  return `weekly-${formatDateId(weekStart(now))}`;
}

/**
 * 取得本週週報——優先回快取（6 小時內），未命中才實際建構（含 Gemini/抓文章，慢）。
 * 詳情頁與列表都改用這個，避免每次點擊都重跑 buildWeeklyReport 造成頁面卡住「點不進去」。
 */
export async function getCachedWeeklyReport(): Promise<WeeklyReportDetail> {
  const id = currentWeeklyReportId();
  const cacheKey = `weekly-report-built-${id}`;
  try {
    const cached: any = await getGenericCache(cacheKey);
    if (cached?.builtAt && cached.report?.id === id && Date.now() - cached.builtAt < REPORT_CACHE_TTL_MS) {
      return cached.report as WeeklyReportDetail;
    }
  } catch (err) {
    console.warn('[WeeklyReport] cache read failed:', err);
  }

  const report = await buildWeeklyReport();
  try {
    await setGenericCache(cacheKey, { builtAt: Date.now(), report });
  } catch (err) {
    console.warn('[WeeklyReport] cache write failed:', err);
  }
  return report;
}

export async function buildWeeklyReport(): Promise<WeeklyReportDetail> {
  const now = new Date();
  const start = weekStart(now);
  const id = `weekly-${formatDateId(start)}`;

  const marketCache = await getMarketReportsCache();
  const newsCache = readNewsCache();

  const shortageNews = Array.isArray(newsCache?.news)
    ? newsCache.news.filter((item: any) => item.riskHit && isRecentSignal(item, now))
    : [];
  const lifecycleNews = Array.isArray(newsCache?.lifecycleNews)
    ? newsCache.lifecycleNews.filter((item: any) => item.riskHit && isRecentSignal(item, now))
    : [];
  const marketReports = Array.isArray(marketCache?.reports) ? marketCache.reports : [];

  // 自家快照（150 顆基準料的週環比）——這是別人沒有的內部測量，當主訊號
  const allMpns = BENCHMARK_PARTS.map((p) => p.mpn);
  const snapshotHistory = await getDemandForecastSnapshotHistory(allMpns);

  const categorySignals = DEMAND_CATEGORIES.map((cat) => {
    const newsCount = shortageNews.filter((item: any) => item.categoryIds?.includes(cat.categoryId)).length;
    const lifecycleCount = lifecycleNews.filter((item: any) => item.categoryIds?.includes(cat.categoryId)).length;
    const reportNotes = categoryReportNotes(cat.categoryId, marketReports);
    const marketReportCount = reportNotes.length;
    const data = computeCategoryDataSignal(cat.categoryId, snapshotHistory);

    // 交叉命中：自家數據異常「且」同類別有外部新聞佐證 → 最高價值訊號
    const crossHit = data.tone !== 'normal' && (newsCount > 0 || lifecycleCount > 0);

    // 類別 tone：數據異常為主，新聞為輔
    const tone: WeeklyRiskLevel =
      crossHit || data.tone === 'high'
        ? 'high'
        : data.tone === 'medium' || newsCount > 0 || lifecycleCount > 0 || marketReportCount > 0
          ? 'medium'
          : 'normal';

    return {
      categoryId: cat.categoryId,
      category: categoryLabel(cat.categoryId, cat.category),
      newsCount,
      lifecycleCount,
      marketReportCount,
      tone,
      plainText: describeCategorySignal(cat.categoryId, data, newsCount, lifecycleCount, marketReportCount),
      reportNotes,
      data,
      crossHit,
    };
  }).filter((item) => item.data.tone !== 'normal' || item.newsCount > 0 || item.lifecycleCount > 0 || item.marketReportCount > 0)
    .sort((a, b) => {
      // 排序權重：交叉命中 > 數據 high > 數據 medium > 外部訊號數量
      const score = (x: typeof a) =>
        (x.crossHit ? 100 : 0) +
        (x.data.tone === 'high' ? 40 : x.data.tone === 'medium' ? 20 : 0) +
        x.data.stockDrop30 * 3 + x.data.priceRise10 * 3 + x.data.supplierDrop * 3 +
        x.newsCount + x.lifecycleCount + x.marketReportCount;
      return score(b) - score(a);
    })
    .slice(0, 10);

  const dataAlertCategories = categorySignals.filter((s) => s.data.tone !== 'normal').length;
  const partsWithSnapshot = categorySignals.reduce((sum, s) => sum + s.data.partsWithSnapshot, 0);

  // 風險等級（刀口4）：交叉命中=高；只有數據異常或外部訊號=中；否則平穩
  const riskLevel: WeeklyRiskLevel = categorySignals.some((item) => item.crossHit)
    ? 'high'
    : dataAlertCategories > 0 || categorySignals.length > 0
      ? 'medium'
      : 'normal';

  // 進 executive 故事的：優先交叉命中，其次數據 high，再不然取前幾名
  const executiveSignals = (() => {
    const cross = categorySignals.filter((s) => s.crossHit);
    if (cross.length > 0) return cross.slice(0, 4);
    const dataHigh = categorySignals.filter((s) => s.data.tone === 'high');
    if (dataHigh.length > 0) return dataHigh.slice(0, 4);
    return categorySignals.slice(0, 3);
  })();

  const focusSignalList = executiveSignals.length > 0 ? executiveSignals : categorySignals.slice(0, 4);
  const focusCategories = Array.from(new Set([
    ...focusSignalList.map((item) => item.categoryId),
  ])).slice(0, 4);

  const focusText = focusCategories.length > 0
    ? focusCategories.map((categoryId) => categoryLabel(categoryId)).join('、')
    : '目前無明顯高風險類別';

  const dateText = formatDate(start);
  const title = buildWeeklyTitle(dateText, focusSignalList);

  // 摘要以「自家數據」為主軸，新聞為輔——講具體顆數，不空泛
  const crossCount = categorySignals.filter((s) => s.crossHit).length;
  const summary = riskLevel === 'high'
    ? `本週監控的 ${partsWithSnapshot} 顆基準料中，${focusText} 等 ${crossCount} 個類別同時出現「庫存／價格實測異動」與「外部缺料新聞」交叉訊號，建議優先盤點未來 4-8 週採購需求與通路配額。`
    : riskLevel === 'medium'
      ? dataAlertCategories > 0
        ? `本週外部新聞無重大事件，但自家快照顯示 ${focusText} 等 ${dataAlertCategories} 個類別出現庫存或價格的週環比異動，建議納入追蹤清單，留意是否擴大。`
        : `本週自家快照無明顯異動，僅外部新聞提及 ${focusText} 等類別之零星前置訊號，維持中度關注即可。`
      : '本週自家快照與外部情報均無顯著異常，主要元件處於正常交期與充足供貨水位，維持例行監控即可。';

  const openingNotes = [
    riskLevel === 'high'
      ? `本週重點：${focusText}。這些類別不只外部有缺料新聞，我們每週實測的庫存／價格數據同步出現異動（雙重驗證），請 PM 與採購優先對接 4-8 週需求。`
      : dataAlertCategories > 0
        ? `本週重點：${focusText}。外部新聞尚平穩，但我們的快照數據已偵測到這些類別的庫存或價格週變動，屬早期訊號，建議納入追蹤。`
        : `本週外部與內部數據均無大幅異常，建議採購窗口順帶跟進 ${focusText} 類別走勢，研發端暫無需介入。`,
    '本週報以「150 顆基準料的每週實測快照」為主訊號，外部新聞與通路報告為佐證；未涉及相關類別的專案維持常規作業即可。',
  ];

  const executiveItems = [];
  for (const signal of executiveSignals) {
    const reportEvidenceList = await Promise.all(marketReports
      .filter((item: any) => item.categoryIds?.includes(signal.categoryId))
      .slice(0, 2)
      .map((item: any) => reportEvidence(item)));
    const evidence = [
      ...(await categoryEvidence(signal.categoryId, shortageNews, 2)),
      ...(await categoryEvidence(signal.categoryId, lifecycleNews, 1)),
      ...reportEvidenceList,
    ].slice(0, 4);

    const item = await buildExecutiveItem(id, signal, evidence);
    executiveItems.push(item);
  }

  const newsHighlights = shortageNews.slice(0, 5).map((item: any) => ({
    title: pickTitle(item),
    source: item.source || 'RSS 新聞',
    url: item.link || '#',
    publishedAt: item.publishedAt || null,
    summary: pickSummary(item),
  }));

  const lifecycleHighlights = lifecycleNews.slice(0, 5).map((item: any) => ({
    title: pickTitle(item),
    source: item.source || 'PCN/EOL 新聞',
    url: item.link || '#',
    publishedAt: item.publishedAt || null,
    summary: pickSummary(item),
  }));

  const marketHighlights = marketReports.slice(0, 6).map((report: any) => ({
    title: reportHeadline(report),
    source: report.source || '公開報告',
    url: report.url || '#',
    publishedAt: report.publishedAt || null,
    summary: reportNarrative(report),
  }));

  const sourceLinks = uniqueSourceLinks([
    ...shortageNews
      .filter((item: any) => item.categoryIds?.some((categoryId: string) => focusCategories.includes(categoryId)))
      .slice(0, 6)
      .map((item: any) => ({
        title: pickTitle(item),
        source: item.source || 'RSS 新聞',
        url: translatedSourceUrl(item.link || '#'),
        publishedAt: item.publishedAt || null,
        dateLabel: sourceDateLabel(item.publishedAt, '新聞'),
        kind: '新聞' as const,
      })),
    ...lifecycleNews
      .filter((item: any) => item.categoryIds?.some((categoryId: string) => focusCategories.includes(categoryId)))
      .slice(0, 4)
      .map((item: any) => ({
        title: pickTitle(item),
        source: item.source || 'PCN/EOL 新聞',
        url: translatedSourceUrl(item.link || '#'),
        publishedAt: item.publishedAt || null,
        dateLabel: sourceDateLabel(item.publishedAt, 'PCN/EOL'),
        kind: 'PCN/EOL' as const,
      })),
    ...marketReports
      .filter((report: any) => report.categoryIds?.some((categoryId: string) => focusCategories.includes(categoryId)))
      .slice(0, 6)
      .map((report: any) => ({
        title: reportHeadline(report),
        source: report.source || '公開報告',
        url: report.url || '#',
        publishedAt: report.publishedAt || report.fetchedAt || null,
        dateLabel: reportSourceDateLabel(report),
        kind: '公開報告' as const,
      })),
  ]).slice(0, 12);

  const recommendedActions = executiveItems.length > 0
    ? []
    : ['本週外部供應鏈指標未達預警標準，建議維持例行庫存監管與通路詢價，持續關注次週情報走勢。'];

  return {
    id,
    title,
    href: `/demand-forecast/weekly-reports/${id}`,
    date: dateText,
    generatedAt: now.toISOString(),
    riskLevel,
    summary,
    metrics: {
      shortageNews: shortageNews.length,
      lifecycleNews: lifecycleNews.length,
      marketReports: marketReports.length,
      watchedCategories: categorySignals.length,
      dataAlertCategories,
      partsWithSnapshot,
    },
    openingNotes,
    executiveItems,
    categorySignals,
    newsHighlights,
    lifecycleHighlights,
    marketHighlights,
    sourceLinks,
    recommendedActions,
  };
}

export async function listWeeklyReports(): Promise<WeeklyReportListItem[]> {
  const report = await getCachedWeeklyReport();
  return [{
    id: report.id,
    title: report.title,
    href: report.href,
    date: report.date,
  }];
}
