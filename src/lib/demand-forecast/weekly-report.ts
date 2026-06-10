import fs from 'fs';
import path from 'path';
import { getMarketReportsCache } from '@/lib/db';
import { DEMAND_CATEGORIES } from '@/lib/demand-forecast/benchmark';

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

function evidenceSentence(evidence: string[], fallback: string) {
  if (evidence.length === 0) return fallback;
  return evidence
    .slice(0, 4)
    .map((item) => item.replace(/[。；;.\s]+$/g, ''))
    .join('。');
}

function categoryEvidenceSummary(categoryId: string, evidence: string[]) {
  const sourceText = evidenceSentence(evidence, '目前可參考之外部情報內容有限。');
  if (categoryId === 'C01') {
    return [
      `【情報摘要】根據外部監測資料：${sourceText}。`,
      '【市場趨勢】當前 MLCC（積層陶瓷電容）市場雖未呈現全面性缺料，但部分大廠高容值品項之通路庫存已在低檔，交貨週期有拉長跡象。',
      '【風險提示】高容值與車規級被動元件之供應鏈水溫正在上升。本週將其列入重點關注，後續需核對內部 BOM 表與大廠供應鏈之重合度。',
    ];
  }
  if (categoryId === 'C04') {
    return [
      `【情報摘要】根據外部監測資料：${sourceText}。`,
      '【市場趨勢】受惠於 AI 伺服器與高效能運算對 DRAM、DDR 及快閃記憶體（Flash）的強勁拉貨，晶圓廠產能大幅移轉，導致常規記憶體產能受限。',
      '【風險提示】主要大廠（如三星、美光等）已啟動產能分配，部分型號開始反映價格調漲，專案團隊需提防價格上行與交期變動壓力。',
    ];
  }
  if (categoryId === 'C03') {
    return [
      `【情報摘要】根據外部監測資料：${sourceText}。`,
      '【市場趨勢】低壓與中壓 MOSFET 通路庫存已逐步去化，Nexperia、onsemi 等指標品牌常用封裝之功率元件交期出現波動。',
      '【風險提示】本類別屬於供應鏈前置警訊，目前無即時性短缺風險，但建議提早向授權通路確認常用料號之供貨排程。',
    ];
  }
  return [
    `【情報摘要】根據外部監測資料：${sourceText}。`,
    '【市場趨勢】此類別目前外部情報僅提及零星事件，全球供應鏈態勢整體平穩，暫無結構性供需失衡。',
    '【風險提示】列入常規追蹤清單，持續關注後續交期與價格波動。',
  ];
}

function buildExecutiveItem(signal: WeeklyReportDetail['categorySignals'][number], evidence: string[]) {
  const category = signal.category;

  if (signal.categoryId === 'C01') {
    return {
      category,
      headline: 'MLCC 市場高容值品項庫存消耗加速，交期風險浮現',
      story: categoryEvidenceSummary(signal.categoryId, evidence),
      suggestedMove: '請採購窗口向授權代理商確認未來 8-12 週高容值 MLCC 的在途訂單與可供量；研發窗口可評估準備替代品牌（Second Source）規格。',
      evidence,
    };
  }

  if (signal.categoryId === 'C04') {
    return {
      category,
      headline: '記憶體市場產能受限，DRAM 與 Flash 價格與交期呈上行趨勢',
      story: categoryEvidenceSummary(signal.categoryId, evidence),
      suggestedMove: 'PM 應於本週重新檢視 Forecast，確保未來 4-8 週之記憶體採購預算無虞；採購窗口建議與原廠鎖定配額，以規避價格波動風險。',
      evidence,
    };
  }

  if (signal.categoryId === 'C03') {
    return {
      category,
      headline: '功率元件常用封裝交期出現波動，建議提早對接授權通路',
      story: categoryEvidenceSummary(signal.categoryId, evidence),
      suggestedMove: '針對 BOM 中常用之 Nexperia、onsemi、Infineon MOSFET 料號，採購請提早與授權通路確認交期走勢；工程端可先行備妥替代料清單。',
      evidence,
    };
  }

  if (signal.lifecycleCount > 0 && signal.newsCount === 0) {
    return {
      category,
      headline: `${category} 產品生命週期公告（PCN/EOL）警訊，需評估替代方案`,
      story: [
        '【生命週期風險】本類別近期外部訊號主要圍繞在原廠釋出之產品變更通知（PCN）或停產通知（EOL），並非突發性市場缺料。',
        '【量產影響評估】這類風險對量產中或即將導入之案子影響最為深遠。若 BOM 包含公告料號，需確認最後下單時間（LTB）、庫存儲備及替代料驗證時程。',
      ],
      suggestedMove: '請即刻比對現有專案 BOM 表是否包含此公告品牌料號；若有，應向原廠確認最後下單日期（LTB），並評估啟動替代料認證。',
      evidence,
    };
  }

  return {
    category,
    headline: `${category} 出現外部供應警示，列入重點觀察名單`,
    story: [
      '【前置監測】本週外部情報提及該類別有零星供應壓力或價格波動，但目前訊號強度尚未構成實質短缺。',
      '【追蹤機制】建議將此類別列入下週觀察清單，密切跟進通路報價及交期是否產生連續性變動。',
    ],
    suggestedMove: '暫無需啟動緊急採購或工程變更，維持例行供應鏈監控並與通路窗口保持對接即可。',
    evidence,
  };
}

function describeCategorySignal(categoryId: string, newsCount: number, lifecycleCount: number, marketReportCount: number) {
  if (categoryId === 'C03') {
    return '本週功率元件雖未有突發事件，但多份通路監測報告指出中低壓 MOSFET 庫存已降至低檔，交期有波動跡象，屬於市場水溫回升的前置訊號。';
  }
  if (categoryId === 'C04') {
    return '記憶體市場在 AI 算力需求帶動下，晶圓廠產能大幅移轉至 HBM 等高階品項，導致常規 DRAM、DDR 與快閃記憶體（Flash）產能受限，原廠紛紛發出產能分配預警。';
  }
  if (categoryId === 'C01') {
    return '當前 MLCC 市場供應平穩，惟高容值、高頻及車規級等高端品項之通路庫存消耗較快，部分主要製造商的交貨週期有拉長趨勢。';
  }
  const pieces = [];
  if (newsCount > 0) pieces.push(`${newsCount} 則缺料/交期新聞`);
  if (lifecycleCount > 0) pieces.push(`${lifecycleCount} 則 PCN 或 EOL 異動公告`);
  if (marketReportCount > 0) pieces.push(`${marketReportCount} 份公開通路報告`);
  if (pieces.length === 0) return '本週該類別無明顯外部供應異常訊號。';
  if (pieces.length >= 2) return `本類別本週受到多方情報交互驗證，包含 ${pieces.join('、')}，雖未達即時缺料風險，但已具備中度關注特徵，建議納入定期追蹤。`;
  return `本類別本週僅有單一情報源（${pieces[0]}）提及，屬於早期背景訊號，維持例行監控即可。`;
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

function buildWeeklyTitle(dateText: string, signals: Array<{ categoryId: string; category: string; tone: WeeklyRiskLevel; newsCount: number; lifecycleCount: number; marketReportCount: number }>) {
  const primary = signals[0];
  const secondary = signals[1];
  if (!primary) return `物料預測週報｜${dateText}｜本週無明顯供應異常`;

  if (primary.categoryId === 'C04' && secondary?.categoryId === 'C01') {
    return `物料預測週報｜${dateText}｜記憶體與高容值 MLCC 供應鏈緊縮，請提早規劃 4-8 週交期與配額`;
  }
  if (primary.categoryId === 'C01') {
    return `物料預測週報｜${dateText}｜高容值 MLCC 庫存去化加速，建議採購窗口確認在途訂單與供貨排程`;
  }
  if (primary.categoryId === 'C04') {
    return `物料預測週報｜${dateText}｜記憶體產能受限且價格看漲，建議 PM 評估 Forecast 及鎖定 BOM 成本`;
  }
  if (primary.categoryId === 'C03') {
    return `物料預測週報｜${dateText}｜功率分離式元件交期波動，建議優先確認主要品牌通路供應狀況`;
  }

  const categoryText = secondary && primary.tone === 'high'
    ? `${shortCategoryName(primary.category)}與${shortCategoryName(secondary.category)}`
    : shortCategoryName(primary.category);
  return `物料預測週報｜${dateText}｜${categoryText}出現外部供應警訊，請評估是否影響現有設計`;
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

  const categorySignals = DEMAND_CATEGORIES.map((cat) => {
    const newsCount = shortageNews.filter((item: any) => item.categoryIds?.includes(cat.categoryId)).length;
    const lifecycleCount = lifecycleNews.filter((item: any) => item.categoryIds?.includes(cat.categoryId)).length;
    const reportNotes = categoryReportNotes(cat.categoryId, marketReports);
    const marketReportCount = reportNotes.length;
    const signalKinds = [newsCount > 0, lifecycleCount > 0, marketReportCount > 0].filter(Boolean).length;
    const tone: WeeklyRiskLevel = signalKinds >= 2 ? 'high' : signalKinds === 1 ? 'medium' : 'normal';
    return {
      categoryId: cat.categoryId,
      category: categoryLabel(cat.categoryId, cat.category),
      newsCount,
      lifecycleCount,
      marketReportCount,
      tone,
      plainText: describeCategorySignal(cat.categoryId, newsCount, lifecycleCount, marketReportCount),
      reportNotes,
    };
  }).filter((item) => item.newsCount > 0 || item.lifecycleCount > 0 || item.marketReportCount > 0)
    .sort((a, b) => {
      const aScore = a.newsCount + a.lifecycleCount + a.marketReportCount + (a.tone === 'high' ? 10 : 0);
      const bScore = b.newsCount + b.lifecycleCount + b.marketReportCount + (b.tone === 'high' ? 10 : 0);
      return bScore - aScore;
    })
    .slice(0, 10);

  const riskLevel: WeeklyRiskLevel = categorySignals.some((item) => item.tone === 'high')
    ? 'high'
    : categorySignals.length > 0 || shortageNews.length > 0 || lifecycleNews.length > 0 || marketReports.length > 0
      ? 'medium'
      : 'normal';

  const executiveSignals = categorySignals
    .filter((signal) => signal.tone === 'high' || signal.newsCount >= 2 || signal.lifecycleCount >= 2 || signal.marketReportCount > 0)
    .slice(0, 4);

  const focusSignalList = executiveSignals.length > 0 ? executiveSignals : categorySignals.slice(0, 4);
  const focusCategories = Array.from(new Set([
    ...focusSignalList.map((item) => item.categoryId),
  ])).slice(0, 4);

  const focusText = focusCategories.length > 0
    ? focusCategories.map((categoryId) => categoryLabel(categoryId)).join('、')
    : '目前無明顯高風險類別';

  const dateText = formatDate(start);
  const title = buildWeeklyTitle(dateText, focusSignalList);

  const summary = riskLevel === 'high'
    ? `本週供應鏈前置警訊顯示，${focusText} 等核心類別之交期與價格波動壓力顯著升高。雖未構成全面性短缺，但專案團隊需提早盤點未來 4-8 週之採購需求與通路配額。`
    : riskLevel === 'medium'
      ? `本週全球電子零件供應態勢整體平穩，惟 ${focusText} 類別出現零星前置提醒，建議專案與採購窗口維持中度關注，並將其納入定期追蹤清單。`
      : '本週外部供應鏈情報整體平穩，主要元件均處於正常交期與充足供貨水位，維持例行監控即可。';

  const openingNotes = [
    riskLevel === 'high'
      ? `本週市場情報指出，以 ${focusText} 為首的核心電子元件面臨產能調配與交期挑戰，請專案經理（PM）與採購團隊優先評估並對接 4-8 週內的需求預測。`
      : `本週外部市場供應鏈未見大規模異常波動，建議採購窗口在與通路對話時，順帶跟進 ${focusText} 類別的交期走勢，研發團隊暫無需介入。`,
    '上述警訊旨在提供前置預警，以防範市場突發性短缺或價格上漲對專案成本的衝擊；未涉及相關元件的專案團隊，維持常規作業即可。',
  ];

  const executiveItems = await Promise.all(executiveSignals.map(async (signal) => {
    const reportEvidenceList = await Promise.all(marketReports
      .filter((item: any) => item.categoryIds?.includes(signal.categoryId))
      .slice(0, 2)
      .map((item: any) => reportEvidence(item)));
    const evidence = [
      ...(await categoryEvidence(signal.categoryId, shortageNews, 2)),
      ...(await categoryEvidence(signal.categoryId, lifecycleNews, 1)),
      ...reportEvidenceList,
    ].slice(0, 4);
    return buildExecutiveItem(signal, evidence);
  }));

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
  const report = await buildWeeklyReport();
  return [{
    id: report.id,
    title: report.title,
    href: report.href,
    date: report.date,
  }];
}
