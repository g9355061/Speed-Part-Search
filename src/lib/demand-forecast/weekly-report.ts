import fs from 'fs';
import path from 'path';
import { getMarketReportsCache } from '@/lib/db';
import { DEMAND_CATEGORIES } from '@/lib/demand-forecast/benchmark';

const NEWS_CACHE_PATH = path.join(process.cwd(), 'data', 'news-cache.json');
const RECENT_SIGNAL_DAYS = 45;

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
    whyItMatters: string;
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

function categoryEvidence(categoryId: string, items: any[], limit = 2) {
  const keywords = WEEKLY_CATEGORY_KEYWORDS[categoryId] ?? [];
  return items
    .filter((item) => {
      if (!item.categoryIds?.includes(categoryId)) return false;
      if (keywords.length === 0) return true;
      const text = `${pickTitle(item)} ${pickSummary(item)}`.toLowerCase();
      return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
    })
    .sort((a, b) => dateValue(b) - dateValue(a))
    .slice(0, limit)
    .map((item) => `${item.source || '來源'}：${pickTitle(item)}`);
}

function buildExecutiveItem(signal: WeeklyReportDetail['categorySignals'][number], evidence: string[]) {
  const category = signal.category;

  if (signal.categoryId === 'C01') {
    return {
      category,
      headline: 'MLCC 不是全面警報，但高容值料要先問交期',
      whyItMatters: 'AI 伺服器與高功率產品用到更多高容值 MLCC，市場開始提醒交期可能拉長。這不是所有電容都缺，而是高容值、小尺寸或車規料要先確認。',
      suggestedMove: '這週先別把所有電容都拉警報，先挑高容值、小尺寸、車規或用量大的 MLCC 問交期。若供應商開始保守，工程再同步看替代封裝或容量組合。',
      evidence,
    };
  }

  if (signal.categoryId === 'C04') {
    return {
      category,
      headline: '記憶體類要先看 DDR / Flash 成本與交期壓力',
      whyItMatters: 'AI 伺服器需求正在推高記憶體用量，DDR4 供應變化也可能影響電腦、車用與工控產品成本。若專案用到 DRAM、DDR 或 Flash，未來幾週的價格與交期需要先確認。',
      suggestedMove: '先看最近需求上修或客戶拉貨的案子，有沒有用到 DDR、DRAM 或 Flash。若有，這週就把價格和交期風險放進 forecast，不要等報價變動才討論。',
      evidence,
    };
  }

  if (signal.categoryId === 'C03') {
    return {
      category,
      headline: '功率分離式元件先列為觀察，不急著升級成缺料',
      whyItMatters: '目前看到的是公開報告提醒 MOSFET 等功率元件可能有供應風險，但還沒有形成明顯新聞熱度。比較合理的做法是先問供應商，不必直接判定為缺料。',
      suggestedMove: 'MOSFET 先不要當成全面缺料，但常用的 Nexperia、Infineon、onsemi 料號可以先問授權通路。工程端先把替代料清單留在手邊即可。',
      evidence,
    };
  }

  if (signal.lifecycleCount > 0 && signal.newsCount === 0) {
    return {
      category,
      headline: `${category} 主要是生命週期訊號，請先查是否影響現有設計`,
      whyItMatters: '這類比較不是市場缺料，而是可能有產品變更、停產或不建議新設計使用的通知。重點不是搶料，而是先確認現有設計會不會受影響。',
      suggestedMove: '先比對現有 BOM 是否真的用到這類料。若有，再確認最後下單時間、替代料和是否需要提前通知客戶。',
      evidence,
    };
  }

  return {
    category,
    headline: `${category} 有外部訊號，先列入下週追蹤`,
    whyItMatters: '這類本週有外部消息提到，但訊號還不夠強，不適合直接下缺料結論。先觀察是否有更多來源或供應商交期變化。',
    suggestedMove: '先把它放進下週觀察清單。若又出現第二個來源，或供應商開始改交期，再升級處理。',
    evidence,
  };
}

function describeCategorySignal(categoryId: string, newsCount: number, lifecycleCount: number, marketReportCount: number) {
  if (categoryId === 'C03') {
    return '功率元件這週沒有爆出大新聞，但幾份通路報告開始把 MOSFET 拉出來講。這通常不是立刻缺料，而是供應鏈水溫先升高。';
  }
  if (categoryId === 'C04') {
    return '記憶體的訊號比較像需求端先動起來，AI 伺服器把 DRAM、DDR、Flash 的用量往上推，供應商也開始提醒分配與成本壓力。';
  }
  if (categoryId === 'C01') {
    return 'MLCC 目前不是全面吃緊，比較像高容值、用量大的料先被市場盯上。若案子用到小尺寸高容值電容，就值得先看一下庫存。';
  }
  const pieces = [];
  if (newsCount > 0) pieces.push(`${newsCount} 則缺料/交期新聞`);
  if (lifecycleCount > 0) pieces.push(`${lifecycleCount} 則 PCN 或 EOL 公告`);
  if (marketReportCount > 0) pieces.push(`${marketReportCount} 份公開報告`);
  if (pieces.length === 0) return '本週暫時沒有特別訊號。';
  if (pieces.length >= 2) return `這類本週被不同來源同時提到，包含 ${pieces.join('、')}。訊號還不到警報，但已經值得放進下週觀察。`;
  return `這類本週只有 ${pieces[0]} 提到，訊號還很早，先當成背景提醒即可。`;
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

function categoryReportNotes(categoryId: string, reports: any[]) {
  const matchedReports = reports.filter((report) => report.categoryIds?.includes(categoryId)).slice(0, 3);
  const sourceNames = matchedReports.map((report) => report.source || '公開報告');
  if (matchedReports.length === 0) return [];

  if (categoryId === 'C03') {
    return [
      `${sourceNames.join(' 和 ')} 都把焦點放在 MOSFET。PPSI 提到 Nexperia 供應風險與關稅挑戰，Future 則提到低壓 MOSFET 因市場變緊、庫存消耗，開始出現供應分配的味道。`,
      '換句話說，這不像已經全面缺料，比較像市場先提醒大家：常用功率料不要等到急單才問，現在先確認通路會比較安心。',
    ];
  }

  if (categoryId === 'C04') {
    return [
      `${sourceNames.join(' 和 ')} 都在講記憶體壓力。PPSI 把原因指向 AI 需求，Future 則提到 DRAM、Flash 供應可能進入分配，BOM 成本和交期都可能被推高。`,
      '這類訊號對讀者的意思是：如果產品裡有 DDR、DRAM 或 Flash，接下來要注意的不是單一料號，而是整個記憶體成本曲線可能開始變硬。',
    ];
  }

  if (categoryId === 'C01') {
    return [
      `${sourceNames.join(' 和 ')} 提到的是高容值 MLCC。重點不是所有電容都缺，而是庫存消耗加快、市場變緊後，高容值或高用量料可能先被配貨。`,
      '如果現有案子大量使用小尺寸、高容值或車規 MLCC，這週可以先把可供量問起來；一般低用量電容則不需要過度反應。',
    ];
  }

  return matchedReports.map((report) => {
    const source = report.source || '公開報告';
    const summary = reportSummary(report);
    return summary ? `${source} 提到：${summary}` : `${source} 提到此類別供應狀況需要留意。`;
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
      return '這份報告把記憶體壓力和 AI 需求連在一起看。意思是伺服器端的拉貨如果持續，DRAM、DDR、Flash 的供應可能會先變成分配，再慢慢反映到 BOM 成本和交期。';
    }
    return 'Future 提醒的是記憶體與快閃記憶體的供應正在變緊，部分供應商已經開始配貨。這代表接下來幾週，用到 DDR、DRAM 或 Flash 的案子，要比平常更早確認價格和交期。';
  }
  if (categoryIds.includes('C01')) {
    return '這份報告講的不是所有電容都缺，而是高容值 MLCC 的庫存消耗比較快，供應商開始變得保守。對產品團隊來說，比較需要先看的會是小尺寸、高容值、車規或高用量的 MLCC。';
  }
  if (categoryIds.includes('C03')) {
    if (source.includes('PPSI')) {
      return 'PPSI 這次把 MOSFET 交期、Nexperia 供應風險和關稅挑戰放在一起看。這還不是全面缺料警報，但已經像是市場在提醒：常用功率料最好先問一下通路狀況。';
    }
    return 'Future 看到的是低壓 MOSFET 因為市場變緊、庫存消耗，開始有供應分配的跡象。這類訊號通常會先從常用料和熱門封裝反映出來，不一定馬上擴散到全部功率元件。';
  }
  if (categoryIds.length > 0) {
    return `${sourceText} 這份報告主要提到 ${reportCategoryNames(report)}。如果現有案子剛好用到這些類別，先把交期、可供量和替代料問清楚，會比等到急單再追更穩。`;
  }
  return `${sourceText} 這份報告可當成供應風險的背景參考；若內容剛好和現有 BOM 類別重疊，再進一步往料號層級確認。`;
}

function reportHeadline(report: any) {
  const categoryIds = reportCategoryIds(report);
  if (categoryIds.includes('C04')) {
    return '記憶體配給與成本壓力升高，先問 DDR / Flash 交期';
  }
  if (categoryIds.includes('C01')) {
    return '高容值 MLCC 開始配貨，先確認可供量';
  }
  if (categoryIds.includes('C03')) {
    return 'MOSFET 供應風險浮現，先查常用功率料';
  }
  return report.titleZh || report.title || '公開報告提醒供應狀況需留意';
}

function sourceLinkKey(item: { title: string; source: string; url: string }) {
  return item.url && item.url !== '#' ? item.url : `${item.source}-${item.title}`;
}

function uniqueSourceLinks(items: Array<{ title: string; source: string; url: string; kind: '新聞' | 'PCN/EOL' | '公開報告' }>) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = sourceLinkKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shortCategoryName(label: string) {
  return label.split('/')[0].trim();
}

function buildWeeklyTitle(dateText: string, signals: Array<{ categoryId: string; category: string; tone: WeeklyRiskLevel; newsCount: number; lifecycleCount: number; marketReportCount: number }>) {
  const primary = signals[0];
  const secondary = signals[1];
  if (!primary) return `物料預測週報｜${dateText}｜本週無明顯供應異常`;

  if (primary.categoryId === 'C04' && secondary?.categoryId === 'C01') {
    return `物料預測週報｜${dateText}｜記憶體與高容值 MLCC 供應壓力升溫，請先確認 4-8 週需求與交期`;
  }
  if (primary.categoryId === 'C01') {
    return `物料預測週報｜${dateText}｜高容值 MLCC 交期需先確認，採購請回查可供量`;
  }
  if (primary.categoryId === 'C04') {
    return `物料預測週報｜${dateText}｜記憶體成本與交期壓力升高，PM 請確認需求是否上修`;
  }
  if (primary.categoryId === 'C03') {
    return `物料預測週報｜${dateText}｜功率元件供應風險浮現，請先確認 Nexperia / onsemi 通路`;
  }

  const categoryText = secondary && primary.tone === 'high'
    ? `${shortCategoryName(primary.category)}與${shortCategoryName(secondary.category)}`
    : shortCategoryName(primary.category);
  return `物料預測週報｜${dateText}｜${categoryText}出現外部供應訊號，請確認是否影響現有案子`;
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
    ? `本週供應鏈訊號主要集中在 ${focusText}。這不代表已經全面缺料，但如果近期專案有用到這些類別，採購與 PM 應先確認交期、價格與 4-8 週需求。`
    : riskLevel === 'medium'
      ? `本週供應鏈壓力還沒有全面升溫，但 ${focusText} 已開始出現零星提醒。先不用升級成缺料警報，但可以放進追蹤清單。`
      : '本週外部訊號相對安靜，暫時沒有看到需要立刻升級處理的類別。';

  const openingNotes = [
    riskLevel === 'high'
      ? `本週最值得先看的是 ${focusText}。重點不是「現在一定缺料」，而是這些類別已經開始出現交期、價格或產品生命週期的提醒，適合先進入採購與工程的觀察清單。`
      : `本週外部訊號還沒有全面升溫，先把 ${focusText} 放進追蹤清單即可，不需要立刻升級成缺料警報。`,
    '如果手上的專案正在用到這些類別，請先確認未來 4-8 週需求是否有上修；沒有用到的團隊只需要知道方向，不必逐顆料號追查。',
  ];

  const executiveItems = executiveSignals.map((signal) => {
    const evidence = [
      ...categoryEvidence(signal.categoryId, shortageNews, 2),
      ...categoryEvidence(signal.categoryId, lifecycleNews, 1),
      ...marketReports
        .filter((item: any) => item.categoryIds?.includes(signal.categoryId))
        .slice(0, 1)
        .map((item: any) => `${item.source || '公開報告'}：${reportSummary(item) || '公開報告提到此類別'}`),
    ].slice(0, 3);
    return buildExecutiveItem(signal, evidence);
  });

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
        url: item.link || '#',
        kind: '新聞' as const,
      })),
    ...lifecycleNews
      .filter((item: any) => item.categoryIds?.some((categoryId: string) => focusCategories.includes(categoryId)))
      .slice(0, 4)
      .map((item: any) => ({
        title: pickTitle(item),
        source: item.source || 'PCN/EOL 新聞',
        url: item.link || '#',
        kind: 'PCN/EOL' as const,
      })),
    ...marketReports
      .filter((report: any) => report.categoryIds?.some((categoryId: string) => focusCategories.includes(categoryId)))
      .slice(0, 6)
      .map((report: any) => ({
        title: reportHeadline(report),
        source: report.source || '公開報告',
        url: report.url || '#',
        kind: '公開報告' as const,
      })),
  ]).slice(0, 12);

  const recommendedActions = executiveItems.length > 0
    ? []
    : ['本週沒有明顯封面故事，維持例行監控即可；下週再看新聞、PCN/EOL 和公開報告是否連續出現。'];

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
