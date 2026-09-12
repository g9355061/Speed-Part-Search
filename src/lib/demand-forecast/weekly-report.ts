import { getMarketReportsCache, getGenericCache, listGenericCacheByPrefix, setGenericCache, getDemandForecastSnapshotHistory, type SnapshotPoint } from '@/lib/db';
import { DEMAND_CATEGORIES, BENCHMARK_PARTS, CATEGORY_NEWS_KEYWORDS } from '@/lib/demand-forecast/benchmark';
import { readCache as readPartsCache, readNewsCacheShared, lifecycleFlag } from '@/lib/demand-forecast/cache-util';
import { translateToZhTW } from '@/lib/demand-forecast/translate';
import { keywordMatches } from '@/lib/demand-forecast/news-match';
import { getFenghuoView, type FenghuoMarketTrend, type FenghuoView } from '@/lib/demand-forecast/fenghuo';
import crypto from 'crypto';

// 一週一刊：本期只收「這一週」的新聞。原本 45 天窗會讓相鄰兩期素材幾乎全同，
// 加上固化後整週不變，造成 7/13 與 7/20 兩期內容一模一樣（2026-07-20 修正）。
const RECENT_SIGNAL_DAYS = 8;
const ARTICLE_FETCH_TIMEOUT_MS = 4500;
const ARTICLE_TEXT_LIMIT = 9000;
const ARTICLE_POINT_LIMIT = 6;

// 週報撰稿模型：預設 Gemini 3.8 Flash（產出比 2.5 Flash 明顯更像產業版報導）。
// 需要退版或換模型時設 GEMINI_MODEL 環境變數即可，程式不必動。
const GEMINI_WRITER_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
// 降級鏈：新模型在免費層常回 503（高需求）。主模型重試用盡就換下一個，最後才走本地 fallback。
// 先退同代（3.7 Flash）保住文筆，2.5 Flash 只當最後一道保險。
const GEMINI_WRITER_MODELS = Array.from(new Set([GEMINI_WRITER_MODEL, 'gemini-3.7-flash', 'gemini-2.5-flash']));

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

// 類別層級數據敘述：high-level 質性語言。數字只在幕後決定嚴重度（tone），不輸出顆數/百分比。
function buildDataSignalText(categoryId: string, s: CategoryDataSignal): string {
  if (s.partsWithSnapshot === 0) return '';
  const label = categoryLabel(categoryId);
  const trends: string[] = [];
  if (s.stockDrop50 > 0) trends.push('通路庫存水位明顯下滑');
  else if (s.stockDrop30 > 0) trends.push('通路庫存出現去化跡象');
  if (s.priceRise20 > 0) trends.push('價格走勢轉強');
  else if (s.priceRise10 > 0) trends.push('價格略有上行');
  if (s.supplierDrop > 0) trends.push('供應來源有收斂現象');
  if (trends.length === 0) {
    return `${label}本週通路供應平穩，庫存與價格未見明顯波動。`;
  }
  return `本站每週通路監測顯示，${label}本週${trends.join('、')}。`;
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
    watchpoint?: string;   // AI 生成的「後續觀察」一句話（歷史期數沒有這欄）
    evidence: string[];
  }>;
  categorySignals: Array<{
    categoryId: string;
    category: string;
    newsCount: number;
    lifecycleCount: number;
    marketReportCount: number;
    hotSearchCount?: number;   // 華強當日熱料歸此類的顆數（2026-09-12 起）
    hotSearchNew?: number;     // 其中本週新上榜
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
  /** 本期當素材用掉的市場報告 contentHash——後續期數據此判斷「內容沒變」的固定網址報告（2026-09-12 起） */
  materialHashes?: string[];
  /** 前幾期已報過、本週仍在異常狀態的生命週期料（不再重複當新聞寫，只列一行長期觀察） */
  lifecycleOngoing?: Array<{ mpn: string; manufacturer: string; category: string; status: string; sinceDate: string }>;
  /** 華強烽火指數（現貨市場需求端）：大盤三指數＋當日熱料，獨立於 150 顆基準料（2026-09-12 起） */
  spotMarket?: {
    updatedAt: string | null;
    sourceUrl: string;
    trend: FenghuoMarketTrend | null;
    hasPrevious: boolean;
    hotParts: Array<{
      mpn: string; brand: string; priceCny: number | null; categoryId: string | null; categoryLabel: string;
      isNew: boolean; weeksOnList: number;
    }>;
  };
}

// 週界線與日期顯示一律以台北時間為準（台灣無夏令時間，固定 UTC+8）。
// Railway 伺服器時區是 UTC，不處理的話台北週一早上 8 點前產生的週報會被歸到上一週。
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

function weekStart(date: Date) {
  const shifted = new Date(date.getTime() + TAIPEI_OFFSET_MS);
  const day = shifted.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  shifted.setUTCDate(shifted.getUTCDate() + diff);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - TAIPEI_OFFSET_MS);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Taipei',
  }).format(date);
}

function formatDateId(date: Date) {
  const shifted = new Date(date.getTime() + TAIPEI_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
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
  const categoryKeywords = CATEGORY_NEWS_KEYWORDS[categoryId] ?? [];
  const riskKeywords = [
    'shortage', 'shortages', 'tight', 'constraint', 'constrained', 'allocation',
    'lead time', 'delivery', 'price', 'cost', 'supply', 'demand', 'inventory',
    '短缺', '吃緊', '供應', '需求', '交期', '成本', '價格', '庫存', '配給',
  ];
  let score = 0;
  for (const keyword of categoryKeywords) {
    if (keywordMatches(sentence, keyword)) score += 3;
  }
  for (const keyword of riskKeywords) {
    if (keywordMatches(sentence, keyword)) score += 2;
  }
  // 事實密度加權：報導的原料要有數字與時間，否則模型只寫得出形容詞（2026-09 報紙化修正）
  if (/\d+(\.\d+)?\s*%|百分之/.test(sentence)) score += 4;                    // 漲跌幅
  if (/(\$|US\$|USD|NT\$|人民幣|美元|元)\s*\d|\d+\s*(美元|元)/.test(sentence)) score += 3; // 價格
  if (/\d+\s*(週|周|weeks?|個月|months?|天|days?)/i.test(sentence)) score += 3; // 交期
  if (/\b(Q[1-4]|20\d{2})\b|\d+\s*月/.test(sentence)) score += 2;             // 時間點
  if (/\d/.test(sentence)) score += 1;                                        // 任何量化數字
  // 具名主體（原廠/通路）：報導要有主詞
  if (/[A-Z][a-zA-Z]{2,}(\s+[A-Z][a-zA-Z]+)?|三星|美光|台積電|聯電|村田|國巨|英飛凌|意法|德儀|恩智浦|安森美|日月光|力積電|南亞科|華邦|旺宏|鎧俠|海力士/.test(sentence)) score += 2;
  if (sentence.length >= 60 && sentence.length <= 220) score += 1;
  return score;
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
    const translated = await Promise.all(candidates.map((sentence) => translateToZhTW(sentence)));
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

async function categoryEvidence(categoryId: string, items: any[], limit = 3) {
  const keywords = CATEGORY_NEWS_KEYWORDS[categoryId] ?? [];
  const keywordHit = (item: any) => {
    if (keywords.length === 0) return true;
    const text = `${item.title || ''} ${item.snippet || ''} ${pickTitle(item)} ${pickSummary(item)}`;
    return keywords.some((keyword) => keywordMatches(text, keyword));
  };
  // 只要新聞已被標記為此類別就納入（上游 fetcher 已分類）；關鍵字命中者優先排序，
  // 不再硬篩掉「標題沒關鍵字、但內文相關」的新聞——這是先前報導內容過少的主因。
  const matched = items
    .filter((item) => item.categoryIds?.includes(categoryId))
    .sort((a, b) => {
      const ka = keywordHit(a) ? 1 : 0;
      const kb = keywordHit(b) ? 1 : 0;
      if (ka !== kb) return kb - ka;
      return dateValue(b) - dateValue(a);
    })
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


// 純文字渲染：剝掉 Gemini 偶爾夾帶的 Markdown 符號與標題行裝飾（**、##、- 條列、【】標題）
function stripMarkdownDecoration(value: unknown): string {
  return String(value ?? '')
    .replace(/^#{1,4}\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/^[-•*]\s+/, '')
    .replace(/^【([^】]+)】$/, '$1')
    .trim();
}

function toParagraphs(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.map((p) => String(p)) : String(value ?? '').split(/\n+/);
  return raw.flatMap((p) => p.split(/\n+/)).map(stripMarkdownDecoration).filter(Boolean);
}

// 空詞黑名單：標題出現這些就退回本地標題（報紙標題要有主體與事實，不是形容詞）
const HOLLOW_HEADLINE_PATTERNS = [
  /訊號升溫/, /值得留意/, /值得關注/, /壓力浮現/, /水溫上升/, /納入觀察/,
  /維持觀察/, /蠢蠢欲動/, /待觀察/, /宜先預備/,
];

function isHollowHeadline(headline: string) {
  if (!headline || headline.length < 6 || headline.length > 40) return true;
  return HOLLOW_HEADLINE_PATTERNS.some((pattern) => pattern.test(headline));
}

export interface WeeklyIssueSection {
  categoryId: string;
  categoryName: string;
  channelText: string;
  spotText?: string;      // 華強現貨熱搜（可點名型號與人民幣參考價）
  evidence: string[];
}

interface WeeklyIssueDraft {
  leadHeadline: string;
  lede: string;
  items: Array<{ categoryId: string; headline: string; story: string[]; watchpoint: string }>;
}

/**
 * 整期一次生成（2026-09 報紙化 rev 4）：以前是每個類別各打一次 Gemini，彼此不知道對方寫了
 * 什麼，所以沒有整期的編輯視角、頭條也只能用罐頭句拼。現在一次把全期素材送進去，讓模型
 * 決定頭條、導言與各篇的主線，呼叫次數反而從 4 次降為 1 次。
 * 失敗或未設定 API key 時回傳 null，呼叫端走本地 fallback（標題與敘述皆為資料驅動）。
 */
async function synthesizeWeeklyIssueWithGemini(
  reportId: string,
  sections: WeeklyIssueSection[],
  marketContext = ''
): Promise<WeeklyIssueDraft | null> {
  const usable = sections.filter((section) => section.evidence.length > 0);
  if (usable.length === 0) return null;

  const materialText = usable
    .map((section, index) => {
      const evidence = section.evidence.map((line) => `  - ${line}`).join('\n');
      const spot = section.spotText ? `\n 華強現貨熱搜（可點名型號與人民幣參考價）：${section.spotText}` : '';
      return `[${index + 1}] categoryId=${section.categoryId}｜類別：${section.categoryName}\n 外部素材：\n${evidence}${spot}\n 本站通路觀測（僅供一句旁證）：${section.channelText || '（本週通路平穩）'}`;
    })
    .join('\n\n') + (marketContext ? `\n\n【市場大盤】${marketContext}` : '');

  const evidenceHash = crypto.createHash('md5').update(materialText).digest('hex');
  const cacheKey = `weekly-issue-gemini-r${REPORT_BUILD_REV}-${GEMINI_WRITER_MODEL}-${reportId}-${evidenceHash}`;

  try {
    const cached = await getGenericCache(cacheKey);
    if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
      console.log(`[WeeklyReport Gemini] Cache HIT for key: ${cacheKey}`);
      return cached as WeeklyIssueDraft;
    }
  } catch (err) {
    console.warn(`[WeeklyReport Gemini] Failed to read cache for key: ${cacheKey}`, err);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('[WeeklyReport Gemini] GEMINI_API_KEY not configured. Using local fallback.');
    return null;
  }

  const currentMonth = new Date().toISOString().slice(0, 7); // e.g. "2026-09"
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
    return null;
  }

  const prompt = `你是公司內部電子供應鏈週刊的主編，本期要寫 ${usable.length} 篇產業版報導。讀者是採購、PM 與工程師。

【本期素材】
${materialText}

寫作要求：
1. 每篇挑一條最有份量的線索當導言（誰、做了什麼、多少），其餘素材當佐證或對照；與主線無關的素材可以捨棄。不要平均分配篇幅，不要逐條並列翻譯。
2. 每篇走倒金字塔：先寫發生了什麼，再寫為什麼會這樣（背景與成因），最後寫對採購、交期或成本的實際影響。
3. 素材裡的具體數字必須寫進報導——價格、漲跌幅、交期週數、產能、月份、營收、廠區、產品型號都要保留，這是產業報導的重點。唯一禁止的是「本站通路觀測」的顆數與百分比，那個只能用一句質性描述帶過（例如「本站監測的通路庫存亦同步走低」）。「華強現貨熱搜」的型號與人民幣參考價可以引用，代表深圳現貨市場買家正在找的料；【市場大盤】可在 lede 用一句帶過。
4. headline 要像報紙標題：主體＋動作＋（有的話）數字，例如「三星減產 DDR4，記憶體現貨價一週漲 12%」。必須取材自該篇素材的具體事實，20 字以內。禁止出現「訊號升溫」「值得留意」「壓力浮現」「水溫上升」「納入觀察」這類空詞，禁止只寫類別名加形容詞。
5. story 兩到三段、每篇合計 280–420 個中文字，筆調像報紙產業版：自然、好讀、有主詞、有動作動詞。禁止空泛詞堆疊，禁止 meta 說明（不要說「本段整理」「根據素材」）。自然帶出消息來源名稱。
6. watchpoint：一句 25–45 字的「後續觀察」，說明接下來一兩週該盯哪個指標、價格或事件。是觀察點，不是待辦清單，不要寫「請採購確認…」這種指令句。
7. leadHeadline：整期頭條，取本期最重要的一條事實寫成 25 字以內的標題，規則同第 4 點。
8. lede：整期導言一段 80–120 字，說明本期最值得看的是什麼、為什麼。
9. 全部繁體中文純文字。禁止任何 Markdown 符號（**、#、- 條列）與獨立標題行。

只輸出 JSON，不要任何其他文字：
{"leadHeadline":"","lede":"","items":[{"categoryId":"${usable[0].categoryId}","headline":"","story":["",""],"watchpoint":""}]}
items 必須依序涵蓋上面每一個 categoryId，一個都不能少、不能多。`;

  const runWithModel = async (model: string): Promise<WeeklyIssueDraft | null> => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  let attempts = 0;
  const maxAttempts = 2; // 週報已快取，毋須為單次建構卡太久；失敗就換模型／走本地 fallback
  let delayMs = 2000;

  while (attempts < maxAttempts) {
    attempts++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000); // 整期一次寫，輸出較長

    try {
      console.log(`[WeeklyReport Gemini] Cache MISS. Writing whole issue with ${model} (${usable.length} stories, attempt ${attempts}/${maxAttempts})...`);

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
            maxOutputTokens: 8192,
            temperature: 0.6, // 0.3 太保守，產出樣板化；報導文體需要一點變化
            responseMimeType: 'application/json',
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
        if (!resultText) return null;

        let parsed: any = null;
        try {
          parsed = JSON.parse(resultText);
        } catch {
          const match = resultText.match(/\{[\s\S]*\}/);
          if (match) {
            try { parsed = JSON.parse(match[0]); } catch { parsed = null; }
          }
        }

        const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];
        const items = rawItems
          .map((item: any) => ({
            categoryId: String(item?.categoryId ?? '').trim(),
            headline: stripMarkdownDecoration(item?.headline),
            story: toParagraphs(item?.story),
            watchpoint: stripMarkdownDecoration(item?.watchpoint),
          }))
          .filter((item: WeeklyIssueDraft['items'][number]) => item.categoryId && item.story.length > 0);

        if (items.length === 0) {
          console.warn('[WeeklyReport Gemini] Response contained no usable stories. Using local fallback.');
          return null;
        }

        const draft: WeeklyIssueDraft = {
          leadHeadline: stripMarkdownDecoration(parsed?.leadHeadline),
          lede: toParagraphs(parsed?.lede).join(''),
          items,
        };

        // Update cost tracking
        const estimatedInputTokens = Math.ceil(prompt.length / 3.5);
        const estimatedOutputTokens = Math.ceil(resultText.length * 2.5);
        const callCost = (estimatedInputTokens * 0.000075 / 1000) + (estimatedOutputTokens * 0.0003 / 1000);

        tracking.cost = (tracking.cost || 0) + callCost;
        tracking.calls = (tracking.calls || 0) + 1;
        await setGenericCache('gemini_monthly_usage', tracking);

        try {
          await setGenericCache(cacheKey, draft);
          console.log(`[WeeklyReport Gemini] Cached issue draft for key: ${cacheKey}`);
        } catch (err) {
          console.warn(`[WeeklyReport Gemini] Failed to cache issue draft for key: ${cacheKey}`, err);
        }

        return draft;
      }

      const errorBody = await res.text().catch(() => '');
      console.warn(`[WeeklyReport Gemini] API error (Attempt ${attempts}): ${res.status} ${res.statusText} ${errorBody.slice(0, 300)}`);
      if (res.status === 429 || res.status >= 500) {
        if (attempts < maxAttempts) {
          // 429＝免費層 RPM 上限（Flash 系列每分鐘 5 次）。Google 會在 retryDelay 告知
          // 還要等多久，2 秒的指數退避對它無效——照它給的秒數等（上限 70 秒）。
          const retryHint = Number(errorBody.match(/"retryDelay"\s*:\s*"(\d+)s"/)?.[1] ?? 0) * 1000;
          const jitter = Math.floor(Math.random() * 2000);
          const sleepMs = Math.min(Math.max(retryHint + 3000, delayMs), 70000) + jitter;
          console.log(`[WeeklyReport Gemini] Retrying in ${sleepMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, sleepMs));
          delayMs *= 2;
          continue;
        }
      }
      return null;
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        console.warn(`[WeeklyReport Gemini] Request timed out (Attempt ${attempts}).`);
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
      return null;
    }
  }

  return null;
  };

  for (const model of GEMINI_WRITER_MODELS) {
    const draft = await runWithModel(model);
    if (draft) return draft;
    console.warn(`[WeeklyReport Gemini] ${model} unavailable, falling back to next writer model.`);
  }
  return null;
}

// 報紙式標題：數據只決定「講哪件事」，標題本身不出現顆數/百分比
function dataDrivenHeadline(category: string, d: CategoryDataSignal, lifecycleCount: number, crossHit: boolean): string {
  const short = shortCategoryName(category);
  if (crossHit && d.stockDrop50 > 0) return `${short}通路庫存快速去化，市場消息同步轉緊`;
  if (crossHit && d.priceRise20 > 0) return `${short}價格蠢蠢欲動，供應端傳出漲價聲音`;
  if (crossHit) return `${short}供應訊號升溫，通路與市場消息同步示警`;
  if (d.stockDrop50 > 0) return `${short}通路庫存水位明顯下滑，補貨交期值得留意`;
  if (d.priceRise20 > 0) return `${short}價格走勢轉強，採購成本壓力浮現`;
  if (d.supplierDrop > 0) return `${short}供應來源收斂，替代方案宜先預備`;
  if (d.stockDrop30 > 0) return `${short}通路庫存悄悄去化，建議納入觀察`;
  if (d.priceRise10 > 0) return `${short}報價略有上行，後續走勢待觀察`;
  if (lifecycleCount > 0) return `${short}原廠發布生命週期公告，替代方案需提早評估`;
  return `${short}出現外部供應警示，列入觀察名單`;
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

// 組裝單篇報導：AI 稿優先，缺項（AI 失敗、空詞標題、無此類別）逐欄退回資料驅動的本地版本
function buildExecutiveItem(
  signal: WeeklyReportDetail['categorySignals'][number],
  evidence: string[],
  aiItem?: { headline: string; story: string[]; watchpoint: string }
) {
  const category = signal.category;
  const d = signal.data;
  const localHeadline = dataDrivenHeadline(category, d, signal.lifecycleCount, signal.crossHit);
  const suggestedMove = dataDrivenSuggestedMove(d, signal.newsCount, signal.lifecycleCount, signal.crossHit);

  const headline = aiItem && !isHollowHeadline(aiItem.headline) ? aiItem.headline : localHeadline;
  const story = aiItem && aiItem.story.length > 0 ? aiItem.story : dataGroundedFallbackStory(signal, evidence);
  const watchpoint = aiItem?.watchpoint || '';

  return { category, headline, story, suggestedMove, watchpoint, evidence };
}

// 不呼叫 AI 時的本地敘述：把新聞/報告內容織進文章，輔以 high-level 通路觀察，不列統計、不掰劇本
function dataGroundedFallbackStory(
  signal: WeeklyReportDetail['categorySignals'][number],
  evidence: string[]
): string[] {
  const d = signal.data;
  const out: string[] = [];

  // 市場面：把多則新聞織成報導（每則一句，標明來源），不只第一則
  const parse = (raw: string) => {
    const m = raw.match(/^([^：]{1,30})：([\s\S]+)$/);
    const source = m ? m[1] : '';
    const body = (m ? m[2] : raw).replace(/^(標題|摘要)：/g, '').trim().replace(/[。\s]+$/, '');
    return { source, body };
  };
  const items = evidence.slice(0, 3).map(parse).filter((x) => x.body.length > 0);
  if (items.length > 0) {
    const first = items[0];
    out.push(first.source ? `市場方面，${first.source} 報導指出：${first.body}。` : `市場方面，${first.body}。`);
    const rest = items.slice(1).map((x) => (x.source ? `${x.source}則提到，${x.body}` : x.body)).join('；');
    if (rest) out.push(`另一方面，${rest}。`);
  }
  // 通路面：high-level 自家觀察（收尾一句）
  if (d.text) out.push(d.text);
  if (out.length === 0) {
    out.push('本週此類別僅有零星外部訊號，通路供應大致平穩，維持例行關注即可。');
  }
  return out;
}

// 類別綜述：high-level 質性語言，不列統計數字
function describeCategorySignal(
  categoryId: string,
  data: CategoryDataSignal,
  newsCount: number,
  lifecycleCount: number,
  marketReportCount: number
) {
  const hasExternal = newsCount > 0 || lifecycleCount > 0 || marketReportCount > 0;
  const externalText = hasExternal ? '市場上也有相關消息流通。' : '';

  if (data.tone !== 'normal' && data.text) {
    const verdict = hasExternal
      ? '通路與市場消息同步出現變化，建議列為本週優先關注。'
      : '市場消息尚平靜，屬通路端的早期訊號，建議納入觀察。';
    return `${data.text}${verdict}`;
  }
  if (data.partsWithSnapshot > 0) {
    return `本類別通路供應本週平穩。${externalText || '市場亦無明顯訊號。'}`;
  }
  if (!hasExternal) return '本週該類別市場與通路皆無明顯訊號。';
  return `本類別市場上有相關消息流通，通路觀測資料仍在累積中，建議維持例行關注。`;
}

// 報告摘要一律取自報告本身的實際內容，不加任何寫死的敘述——
// 寫死文案會在來源報告換題目後繼續照唸，內容與事實脫鉤（2026-07 review 修正）。
function reportSummary(report: any) {
  const summary = report.summaryZh || report.evidenceTextZh || report.evidenceText || report.titleZh || report.title || '';
  return String(summary).replace(/\s+/g, ' ').trim();
}

async function reportEvidence(report: any) {
  const source = report.source || '公開報告';
  const rawText = cleanEvidenceText(report.evidenceTextZh || report.evidenceText || report.summaryZh || report.titleZh || report.title || '公開報告提到此類別');
  const text = await translateToZhTW(rawText);
  return `${source}：${text}`;
}

// 類別報告備註：只轉述報告的實際摘要，不套硬編碼劇本（劇本會在來源換題目後照唸舊內容）
function categoryReportNotes(categoryId: string, reports: any[]) {
  const matchedReports = reports.filter((report) => report.categoryIds?.includes(categoryId)).slice(0, 3);
  if (matchedReports.length === 0) return [];

  return matchedReports.map((report) => {
    const source = report.source || '公開報告';
    const summary = reportSummary(report);
    return summary ? `${source} 報告指出：${summary}` : `${source} 提示本類別供應狀況值得關注。`;
  });
}

function reportHeadline(report: any) {
  return report.titleZh || report.title || '公開市場報告';
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

  // 交叉命中：市場消息 + 通路觀測同步 → 語氣最強
  if (primary.crossHit) {
    return `物料預測週報｜${dateText}｜${catText} 供應訊號升溫，建議提早確認交期與需求`;
  }
  // 純通路觀測異動（市場消息尚未發酵）
  if (primary.data.tone !== 'normal') {
    if (primary.data.priceRise10 > 0 && primary.data.stockDrop30 === 0) {
      return `物料預測週報｜${dateText}｜${catText} 價格走勢轉強，留意採購成本`;
    }
    if (primary.data.supplierDrop > 0 && primary.data.stockDrop30 === 0 && primary.data.priceRise10 === 0) {
      return `物料預測週報｜${dateText}｜${catText} 供應來源收斂，建議預備替代方案`;
    }
    return `物料預測週報｜${dateText}｜${catText} 通路庫存走弱，值得提早留意`;
  }
  // 只有外部新聞、通路無異動 → 用語放軟，不誇大
  return `物料預測週報｜${dateText}｜市場消息聚焦 ${catText}，通路供應暫穩，維持觀察`;
}

const EMPTY_REPORT_RETRY_MS = 6 * 60 * 60 * 1000; // 空殼報告 6 小時後才重試建構

// 建構邏輯版本：升版會讓「本週」既有的固化快取重建一次（歷史期數不受影響）。
// v2＝2026-07-20 修正「相鄰兩期一模一樣」：新聞窗縮為 8 天＋與上一期 URL 去重。
// v3＝2026-07-20 剝除 Gemini 報導中的 Markdown 符號（頁面純文字渲染會原樣顯示）。
// v4＝2026-09-04 報紙化：整期一次生成（頭條/導言/各篇標題與後續觀察皆取自素材事實），
//     素材抽句加權含數字與具名主體的句子，報導保留素材裡的價格、漲跌幅與交期數字。
// v5＝2026-09-12 素材正確性：新聞分類改字邊界比對＋股票站黑名單、市場報告抽正文並以 contentHash 去重、
//     生命週期只算本期首次出現（舊 NRND 歸長期觀察）。
// v6＝2026-09-12 接入華強烽火指數：大盤三指數進導言脈絡、當日熱料當各類別的現貨熱搜訊號（獨立於 150 顆）。
const REPORT_BUILD_REV = 6;

function currentWeeklyReportId(now = new Date()) {
  return `weekly-${formatDateId(weekStart(now))}`;
}

// 來源連結存的是 Google 翻譯包裝網址，去重前還原成原始 URL
function unwrapTranslatedUrl(url: string) {
  if (!url.includes('translate.google.com')) return url;
  const m = url.match(/[?&]u=([^&]+)/);
  if (!m) return url;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return url;
  }
}

// 歷史期數（由新到舊）——素材去重與生命週期「首次出現」判定共用
async function loadPreviousIssues(currentId: string): Promise<WeeklyReportDetail[]> {
  try {
    const cached = await listGenericCacheByPrefix<{ report?: WeeklyReportDetail }>('weekly-report-built-weekly-', 104);
    return cached
      .map((entry) => entry.data?.report)
      .filter((report): report is WeeklyReportDetail => !!report?.id && report.id !== currentId)
      .sort((a, b) => b.id.localeCompare(a.id));
  } catch (err) {
    console.warn('[WeeklyReport] failed to load previous issues:', err);
    return [];
  }
}

// 上一期已報過的新聞 URL——本期不重印（一週一刊：舊聞不重印）
// 市場報告改看 contentHash（跨全部歷史期數）：固定網址的報告以前只比上一期 URL，
// 會「這期擋掉、下期又出現」隔週重出（2026-09-12 修正）。
function previousIssueMaterial(previous: WeeklyReportDetail[]) {
  const urls = new Set<string>();
  const hashes = new Set<string>();
  const last = previous[0];
  if (last) {
    const items = [...(last.newsHighlights ?? []), ...(last.marketHighlights ?? []), ...(last.sourceLinks ?? [])];
    for (const item of items) {
      if (item.url && item.url !== '#') urls.add(unwrapTranslatedUrl(item.url));
    }
  }
  for (const report of previous) {
    for (const hash of report.materialHashes ?? []) hashes.add(hash);
  }
  return { urls, hashes };
}

// ---- 生命週期「首次出現」登錄簿 ----
// 同一顆 NRND 料（ATMEGA328P、MP1584EN、LAN8720A）從 7 月起每週都被當外部訊號、每週交叉命中、
// 每週寫成封面故事。改為只有「本期首次出現／狀態改變」才算本週事件，其餘列為長期觀察。
const LIFECYCLE_SEEN_KEY = 'lifecycle-seen-v1';

interface LifecycleSeenEntry { status: string; firstSeenIssueId: string; firstSeenDate: string }
type LifecycleSeenRegistry = Record<string, LifecycleSeenEntry>;

function issueDateText(issueId: string) {
  const m = issueId.match(/^weekly-(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}/${m[2]}/${m[3]}` : issueId;
}

// 登錄簿不存在（首次部署）時，從歷史期數的生命週期短訊回填，避免舊料在改版後全部變成「本週新增」
function bootstrapLifecycleRegistry(previous: WeeklyReportDetail[]): LifecycleSeenRegistry {
  const registry: LifecycleSeenRegistry = {};
  for (const report of [...previous].sort((a, b) => a.id.localeCompare(b.id))) {
    const seen: Array<{ mpn: string; status: string }> = [];
    for (const item of report.lifecycleHighlights ?? []) {
      const m = item.title.match(/^(\S+) 原廠標示 (.+)$/);
      if (m) seen.push({ mpn: m[1], status: m[2] });
    }
    for (const item of report.sourceLinks ?? []) {
      const m = item.kind === 'PCN/EOL' ? item.title.match(/^(\S+?)（.*?）：(.+)$/) : null;
      if (m) seen.push({ mpn: m[1], status: m[2] });
    }
    for (const { mpn, status } of seen) {
      if (!registry[mpn] || registry[mpn].status !== status) {
        registry[mpn] = { status, firstSeenIssueId: report.id, firstSeenDate: report.date || issueDateText(report.id) };
      }
    }
  }
  return registry;
}

async function loadLifecycleRegistry(previous: WeeklyReportDetail[]): Promise<LifecycleSeenRegistry> {
  try {
    const cached = await getGenericCache(LIFECYCLE_SEEN_KEY);
    if (cached && typeof cached === 'object' && !Array.isArray(cached)) return cached as LifecycleSeenRegistry;
  } catch (err) {
    console.warn('[WeeklyReport] lifecycle registry read failed:', err);
  }
  return bootstrapLifecycleRegistry(previous);
}

// 「有素材」＝快取都讀得到（新聞／生命週期／報告任一 >0，或快照已載入）。
// 生命週期改成只算本週新增、報告改成內容去重後，安靜的一週三者可能都是 0，
// 不能再因此整週每 6 小時重建（那會讓同一期讀者看到不同內容）。
function reportHasContent(report: WeeklyReportDetail) {
  return report.metrics.shortageNews + report.metrics.lifecycleNews + report.metrics.marketReports > 0
    || report.metrics.partsWithSnapshot > 0;
}

/**
 * 取得本週週報——一週一刊：建成且有素材就固化，整週內容不再改變（同一期讀者週一
 * 和週三看到的必須是同一份）。只有「建構當下完全沒素材」（如剛部署、新聞快取尚未
 * 抓回）才會在 6 小時後重試，避免整週卡在空殼報告。
 * 正常情況下本週報告由排程（weekly-report-build workflow）在週一早上預先建構，
 * 使用者請求都走快取直回，不會在頁面上等建構。
 */
export async function getCachedWeeklyReport(): Promise<WeeklyReportDetail> {
  const id = currentWeeklyReportId();
  const cacheKey = `weekly-report-built-${id}`;
  try {
    const cached: any = await getGenericCache(cacheKey);
    // rev 不符＝建構邏輯已升版，本週這期重建一次（歷史期數走 getWeeklyReportById，不受 rev 影響）
    if (cached?.builtAt && cached.report?.id === id && cached.rev === REPORT_BUILD_REV) {
      const report = cached.report as WeeklyReportDetail;
      if (reportHasContent(report) || Date.now() - cached.builtAt < EMPTY_REPORT_RETRY_MS) {
        return report;
      }
    }
  } catch (err) {
    console.warn('[WeeklyReport] cache read failed:', err);
  }

  const report = await buildWeeklyReport();
  try {
    await setGenericCache(cacheKey, { builtAt: Date.now(), rev: REPORT_BUILD_REV, report });
  } catch (err) {
    console.warn('[WeeklyReport] cache write failed:', err);
  }
  return report;
}

export async function getWeeklyReportById(id: string): Promise<WeeklyReportDetail | null> {
  if (!/^weekly-\d{4}-\d{2}-\d{2}$/.test(id)) return null;
  if (id === currentWeeklyReportId()) return getCachedWeeklyReport();

  try {
    const cached: any = await getGenericCache(`weekly-report-built-${id}`);
    return cached?.report?.id === id ? cached.report as WeeklyReportDetail : null;
  } catch (err) {
    console.warn(`[WeeklyReport] historical cache read failed for ${id}:`, err);
    return null;
  }
}

export async function buildWeeklyReport(): Promise<WeeklyReportDetail> {
  const now = new Date();
  const start = weekStart(now);
  const id = `weekly-${formatDateId(start)}`;

  const marketCache = await getMarketReportsCache();
  const newsCache = await readNewsCacheShared();

  // 一週一刊去重：上一期報過的新聞本期不再進素材；市場報告看 contentHash（跨全部歷史期數），
  // 內容沒變的固定網址報告只列參考來源、不算本週素材。
  const previousIssues = await loadPreviousIssues(id);
  const prevMaterial = previousIssueMaterial(previousIssues);

  const shortageNews = Array.isArray(newsCache?.news)
    ? newsCache.news.filter((item: any) =>
        item.riskHit && isRecentSignal(item, now) && !(item.link && prevMaterial.urls.has(item.link)))
    : [];
  const allMarketReports: any[] = Array.isArray(marketCache?.reports) ? marketCache.reports : [];
  const isStaleReport = (report: any) =>
    report.contentHash
      ? prevMaterial.hashes.has(report.contentHash)
      : !!(report.url && prevMaterial.urls.has(report.url)); // 舊快取沒有 hash → 退回 URL 比對
  const marketReports = allMarketReports.filter((report) => !isStaleReport(report));
  const staleMarketReports = allMarketReports.filter((report) => isStaleReport(report));

  // 生命週期訊號：由料件 API 的 lifecycleStatus 判定（demand-forecast 已停抓 RSS PCN/EOL 新聞，
  // 舊的 newsCache.lifecycleNews 永遠是空的）。資料來源＝150 顆基準料的最近一次查詢快取。
  // 只有「本期首次出現／狀態改變」的料才算本週事件；前幾期報過的歸長期觀察，不再重複當新聞寫。
  const partsCache = await readPartsCache();
  const lifecycleRegistry = await loadLifecycleRegistry(previousIssues);
  const flaggedParts = ((partsCache?.parts ?? []) as any[])
    .map((part) => ({ part, severity: lifecycleFlag(part.lifecycleStatus) }))
    .filter((item): item is { part: any; severity: 'high' | 'medium' } => item.severity !== null)
    .sort((a, b) => (a.severity === 'high' ? 0 : 1) - (b.severity === 'high' ? 0 : 1));
  const isNewLifecycle = ({ part }: { part: any }) => {
    const entry = lifecycleRegistry[part.mpn];
    return !entry || entry.status !== String(part.lifecycleStatus) || entry.firstSeenIssueId === id;
  };
  const lifecycleParts = flaggedParts.filter(isNewLifecycle);
  const lifecycleOngoing = flaggedParts
    .filter((item) => !isNewLifecycle(item))
    .map(({ part }) => ({
      mpn: String(part.mpn),
      manufacturer: String(part.manufacturer || part.apiManufacturer || ''),
      category: categoryLabel(part.categoryId),
      status: String(part.lifecycleStatus),
      sinceDate: lifecycleRegistry[part.mpn].firstSeenDate,
    }));

  // 更新登錄簿：新料記下首次出現的期別；已恢復正常的料移除（之後再異常會重新算新事件）
  const nextRegistry: LifecycleSeenRegistry = {};
  for (const { part } of flaggedParts) {
    const entry = lifecycleRegistry[part.mpn];
    nextRegistry[part.mpn] = entry && entry.status === String(part.lifecycleStatus)
      ? entry
      : { status: String(part.lifecycleStatus), firstSeenIssueId: id, firstSeenDate: formatDate(start) };
  }
  try {
    await setGenericCache(LIFECYCLE_SEEN_KEY, nextRegistry);
  } catch (err) {
    console.warn('[WeeklyReport] lifecycle registry write failed:', err);
  }

  // 自家快照（150 顆基準料的週環比）——這是別人沒有的內部測量，當主訊號
  const allMpns = BENCHMARK_PARTS.map((p) => p.mpn);
  const snapshotHistory = await getDemandForecastSnapshotHistory(allMpns);

  // 華強烽火指數：現貨市場需求端。熱料清單獨立於 150 顆，不互相比對。
  // 「外部訊號」只算本週新上榜的料——STM32F103 這種常年在榜的不算事件。
  let fenghuo: FenghuoView | null = null;
  try {
    fenghuo = await getFenghuoView();
    if (!fenghuo.available) fenghuo = null;
  } catch (err) {
    console.warn('[WeeklyReport] fenghuo view failed:', err);
  }
  const hotPartsInCategory = (categoryId: string) => (fenghuo?.hotParts ?? []).filter((p) => p.categoryId === categoryId);

  const categorySignals = DEMAND_CATEGORIES.map((cat) => {
    const newsCount = shortageNews.filter((item: any) => item.categoryIds?.includes(cat.categoryId)).length;
    const lifecycleCount = lifecycleParts.filter((item) => item.part.categoryId === cat.categoryId).length;
    const reportNotes = categoryReportNotes(cat.categoryId, marketReports);
    const marketReportCount = reportNotes.length;
    const data = computeCategoryDataSignal(cat.categoryId, snapshotHistory);
    const hotInCat = hotPartsInCategory(cat.categoryId);
    const hotSearchCount = hotInCat.length;
    const hotSearchNew = hotInCat.filter((p) => p.isNew).length;
    const hotSignal = hotSearchNew > 0;

    // 交叉命中：自家數據異常「且」同類別有外部佐證（新聞／新生命週期事件／現貨熱搜事件）→ 最高價值訊號
    const crossHit = data.tone !== 'normal' && (newsCount > 0 || lifecycleCount > 0 || hotSignal);

    // 類別 tone：數據異常為主，外部訊號為輔
    const tone: WeeklyRiskLevel =
      crossHit || data.tone === 'high'
        ? 'high'
        : data.tone === 'medium' || newsCount > 0 || lifecycleCount > 0 || marketReportCount > 0 || hotSignal
          ? 'medium'
          : 'normal';

    return {
      categoryId: cat.categoryId,
      category: categoryLabel(cat.categoryId, cat.category),
      newsCount,
      lifecycleCount,
      marketReportCount,
      hotSearchCount,
      hotSearchNew,
      tone,
      plainText: describeCategorySignal(cat.categoryId, data, newsCount, lifecycleCount, marketReportCount),
      reportNotes,
      data,
      crossHit,
    };
  }).filter((item) => item.data.tone !== 'normal' || item.newsCount > 0 || item.lifecycleCount > 0 || item.marketReportCount > 0 || item.hotSearchNew > 0)
    .sort((a, b) => {
      // 排序權重：交叉命中 > 數據 high > 數據 medium > 外部訊號數量
      const score = (x: typeof a) =>
        (x.crossHit ? 100 : 0) +
        (x.data.tone === 'high' ? 40 : x.data.tone === 'medium' ? 20 : 0) +
        x.data.stockDrop30 * 3 + x.data.priceRise10 * 3 + x.data.supplierDrop * 3 +
        x.newsCount + x.lifecycleCount + x.marketReportCount + x.hotSearchNew * 2;
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

  // 進「封面故事」的類別：優先挑「有新聞素材可寫」的——交叉命中最佳，其次有新聞/PCN
  // 的類別（不論數據），確保每篇報導都吃得到 RSS 內容、不再出現只有一句通路觀察的空殼。
  // 真的沒有任何新聞時，才退而用純數據類別（會是較短的通路觀察）。
  const hasNews = (s: typeof categorySignals[number]) => s.newsCount > 0 || s.lifecycleCount > 0;
  const executiveSignals = (() => {
    const cross = categorySignals.filter((s) => s.crossHit);
    const newsBacked = categorySignals.filter((s) => !s.crossHit && hasNews(s));
    const featured = [...cross, ...newsBacked].slice(0, 4);
    if (featured.length > 0) return featured;
    // 完全沒有新聞素材 → 用數據最顯著的類別墊檔
    const dataHigh = categorySignals.filter((s) => s.data.tone === 'high');
    if (dataHigh.length > 0) return dataHigh.slice(0, 3);
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

  // 先把全期素材收齊，再一次交給 Gemini 寫整期（頭條、導言、各篇主線由同一個編輯視角決定）
  const evidenceByCategory = new Map<string, string[]>();
  for (const signal of executiveSignals) {
    const reportEvidenceList = await Promise.all(marketReports
      .filter((item: any) => item.categoryIds?.includes(signal.categoryId))
      .slice(0, 2)
      .map((item: any) => reportEvidence(item)));
    const lifecycleEvidence = lifecycleParts
      .filter((item) => item.part.categoryId === signal.categoryId)
      .slice(0, 2)
      .map((item) => `代理商料件 API：${item.part.mpn}（${item.part.manufacturer || item.part.apiManufacturer || ''}）原廠生命週期標示為 ${item.part.lifecycleStatus}，建議比對 BOM 是否使用並評估替代料`);
    const evidence = [
      ...(await categoryEvidence(signal.categoryId, shortageNews, 3)),
      ...lifecycleEvidence,
      ...reportEvidenceList,
    ].slice(0, 6);
    evidenceByCategory.set(signal.categoryId, evidence);
  }

  const spotTextFor = (categoryId: string) => {
    const list = hotPartsInCategory(categoryId);
    if (list.length === 0) return '';
    const describe = (p: (typeof list)[number]) => {
      const flags = p.isNew ? '本週新上榜' : p.weeksOnList > 1 ? `連續 ${p.weeksOnList} 次在榜` : '';
      return `${p.mpn}（${p.brand}${p.priceCny != null ? `，參考價 ¥${p.priceCny}` : ''}${flags ? `；${flags}` : ''}）`;
    };
    const sorted = [...list].sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0) || b.weeksOnList - a.weeksOnList);
    return sorted.slice(0, 5).map(describe).join('；');
  };

  const issueDraft = await synthesizeWeeklyIssueWithGemini(
    id,
    executiveSignals.map((signal) => ({
      categoryId: signal.categoryId,
      categoryName: signal.category,
      channelText: signal.data.text,
      spotText: spotTextFor(signal.categoryId),
      evidence: evidenceByCategory.get(signal.categoryId) ?? [],
    })),
    fenghuo?.trend?.text ?? ''
  );
  const draftItems = new Map((issueDraft?.items ?? []).map((item) => [item.categoryId, item]));

  const executiveItems = executiveSignals.map((signal) =>
    buildExecutiveItem(signal, evidenceByCategory.get(signal.categoryId) ?? [], draftItems.get(signal.categoryId)));

  // 週報大標：AI 頭條取自本期最重要的事實；沒有 AI 稿或產出空詞時退回資料驅動標題
  const aiLead = issueDraft?.leadHeadline ?? '';
  const title = aiLead && !isHollowHeadline(aiLead)
    ? `物料預測週報｜${dateText}｜${aiLead}`
    : buildWeeklyTitle(dateText, focusSignalList);

  // 導語：AI 導言優先；否則用 high-level 報紙式罐頭句（只說哪幾個類別值得看，不堆數字）
  const localSummary = riskLevel === 'high'
    ? `本週 ${focusText} 的供應訊號明顯升溫——市場消息與本站通路觀測同步轉緊，建議用到這些類別的專案提早確認未來一至兩個月的需求與交期。`
    : riskLevel === 'medium'
      ? `本週供應鏈大致平穩，惟 ${focusText} 出現值得留意的早期訊號，建議相關採購窗口順手確認交期走勢即可。`
      : '本週市場與通路皆平穩，主要元件交期與供貨正常，維持例行監控即可。';
  const summary = issueDraft?.lede && issueDraft.lede.length >= 40 ? issueDraft.lede : localSummary;

  const openingNotes = [
    riskLevel === 'high'
      ? `本週先看 ${focusText}。這幾個類別的市場消息與通路供應同步出現變化，詳見下方報導；用不到這些類別的專案維持常規作業即可。`
      : dataAlertCategories > 0
        ? `本週先看 ${focusText}。市場消息尚平靜，但通路端已有早期變化的跡象，提早留意總是便宜的。`
        : `本週整體平靜，${focusText} 有些零星消息，順手翻閱即可，研發端暫無需介入。`,
  ];

  const newsHighlights = shortageNews.slice(0, 5).map((item: any) => ({
    title: pickTitle(item),
    source: item.source || 'RSS 新聞',
    url: item.link || '#',
    publishedAt: item.publishedAt || null,
    summary: pickSummary(item),
  }));

  const lifecycleHighlights = lifecycleParts.slice(0, 5).map(({ part, severity }) => ({
    title: `${part.mpn} 原廠標示 ${part.lifecycleStatus}`,
    source: 'DigiKey / Mouser 料件 API',
    url: part.productUrl || '#',
    publishedAt: null,
    summary: `${categoryLabel(part.categoryId)}：${part.manufacturer || part.apiManufacturer || ''} ${part.mpn} 生命週期狀態為 ${part.lifecycleStatus}${severity === 'high' ? '，建議確認最後下單日（LTB）並啟動替代認證' : '，原廠不建議用於新設計'}`,
  }));

  const marketHighlights = marketReports.slice(0, 6).map((report: any) => ({
    title: reportHeadline(report),
    source: report.source || '公開報告',
    url: report.url || '#',
    publishedAt: report.publishedAt || null,
    summary: reportSummary(report),
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
    ...lifecycleParts
      .filter((item) => focusCategories.includes(item.part.categoryId))
      .slice(0, 4)
      .map(({ part }) => ({
        title: `${part.mpn}（${part.manufacturer || part.apiManufacturer || ''}）：${part.lifecycleStatus}`,
        source: 'DigiKey / Mouser 料件 API',
        url: part.productUrl || '#',
        publishedAt: null,
        dateLabel: null,
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
    // 內容與前期相同的報告：不當本週素材，但仍可從這裡翻原文
    ...staleMarketReports
      .filter((report: any) => report.categoryIds?.some((categoryId: string) => focusCategories.includes(categoryId)))
      .slice(0, 4)
      .map((report: any) => ({
        title: reportHeadline(report),
        source: report.source || '公開報告',
        url: report.url || '#',
        publishedAt: report.publishedAt || report.fetchedAt || null,
        dateLabel: '內容與前期相同',
        kind: '公開報告' as const,
      })),
  ]).slice(0, 12);

  const materialHashes = Array.from(new Set(
    marketReports.map((report: any) => report.contentHash).filter((hash: unknown): hash is string => typeof hash === 'string' && hash.length > 0)
  ));

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
      lifecycleNews: lifecycleParts.length,
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
    materialHashes,
    lifecycleOngoing,
    spotMarket: fenghuo ? {
      updatedAt: fenghuo.updatedAt,
      sourceUrl: fenghuo.sourceUrl,
      trend: fenghuo.trend,
      hasPrevious: fenghuo.hasPrevious,
      hotParts: fenghuo.hotParts.map((p) => ({
        mpn: p.mpn, brand: p.brand, priceCny: p.priceCny, categoryId: p.categoryId, categoryLabel: p.categoryLabel,
        isNew: p.isNew, weeksOnList: p.weeksOnList,
      })),
    } : undefined,
  };
}

export async function listWeeklyReports(): Promise<WeeklyReportListItem[]> {
  const current = await getCachedWeeklyReport();
  const cached = await listGenericCacheByPrefix<{ report?: WeeklyReportDetail }>('weekly-report-built-weekly-', 104);
  const reports = new Map<string, WeeklyReportDetail>();
  reports.set(current.id, current);
  for (const entry of cached) {
    const report = entry.data?.report;
    if (report?.id && /^weekly-\d{4}-\d{2}-\d{2}$/.test(report.id)) reports.set(report.id, report);
  }

  return [...reports.values()]
    .sort((a, b) => b.id.localeCompare(a.id))
    .map((report) => ({ id: report.id, title: report.title, href: report.href, date: report.date }));
}
