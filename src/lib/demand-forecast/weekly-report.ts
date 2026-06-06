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
  const parts = [];
  if (signal.newsCount > 0) parts.push('新聞');
  if (signal.lifecycleCount > 0) parts.push('PCN/EOL');
  if (signal.marketReportCount > 0) parts.push('市場情報');
  const sourceText = parts.join(' + ');

  if (signal.categoryId === 'C01') {
    return {
      category,
      headline: 'MLCC 不是全面警報，但高容值料要先問交期',
      whyItMatters: `本週 MLCC 同時被 ${sourceText} 提到，重點比較像是 AI/高功率需求帶動高容值 MLCC 供應吃緊，不是所有電容都要同等緊張。`,
      suggestedMove: '採購先針對高容值、小尺寸、車規或高用量 MLCC 問供應商交期與可供量；工程同步確認是否有可替代封裝或容量組合。',
      evidence,
    };
  }

  if (signal.categoryId === 'C04') {
    return {
      category,
      headline: '記憶體類要先看 DDR / Flash 成本與交期壓力',
      whyItMatters: `記憶體本週被 ${sourceText} 多次提到，訊號集中在 AI 需求、DDR4 供應變化與終端產品成本壓力。`,
      suggestedMove: 'PM 和採購先盤點近期需求上修的案子是否使用 DDR、DRAM、Flash；若有客戶拉貨，先把價格與交期風險寫進 forecast 討論。',
      evidence,
    };
  }

  if (signal.categoryId === 'C03') {
    return {
      category,
      headline: '功率分離式元件先列為觀察，不急著升級成缺料',
      whyItMatters: `目前主要是市場情報提到 MOSFET / discrete 供應風險，新聞熱度還不高，所以比較適合做供應商確認，而不是直接下缺料結論。`,
      suggestedMove: '採購先確認 Nexperia、Infineon、onsemi 等常用功率料的授權通路供應；工程保留替代料清單即可。',
      evidence,
    };
  }

  if (signal.lifecycleCount > 0 && signal.newsCount === 0) {
    return {
      category,
      headline: `${category} 主要是生命週期訊號，請先查是否影響現有設計`,
      whyItMatters: `這類不是市場缺料新聞，而是 PCN/EOL 類訊號。對讀者來說，重點不是搶料，而是避免後續才發現料不能買或不建議新設計使用。`,
      suggestedMove: '工程先比對目前專案 BOM 是否有使用；若有，再請採購確認 LTB、替代料與最後下單時間。',
      evidence,
    };
  }

  return {
    category,
    headline: `${category} 有外部訊號，先列入下週追蹤`,
    whyItMatters: `這類本週被 ${sourceText || '外部來源'} 提到，但訊號還不足以直接變成缺料結論。`,
    suggestedMove: '先追蹤一週，看是否出現第二個來源或供應商交期變化，再決定是否升級處理。',
    evidence,
  };
}

function describeCategorySignal(newsCount: number, lifecycleCount: number, marketReportCount: number) {
  const pieces = [];
  if (newsCount > 0) pieces.push(`${newsCount} 則缺料/交期新聞`);
  if (lifecycleCount > 0) pieces.push(`${lifecycleCount} 則 PCN/EOL 訊號`);
  if (marketReportCount > 0) pieces.push(`${marketReportCount} 筆市場情報`);
  if (pieces.length === 0) return '本週暫時沒有特別訊號。';
  if (pieces.length >= 2) return `這類本週不是單一訊號而已，${pieces.join('、')}都有出現，建議先放進觀察清單。`;
  return `這類本週有 ${pieces[0]}，先不用緊張，但值得保持追蹤。`;
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
    const marketReportCount = marketReports.filter((item: any) => item.categoryIds?.includes(cat.categoryId)).length;
    const signalKinds = [newsCount > 0, lifecycleCount > 0, marketReportCount > 0].filter(Boolean).length;
    const tone: WeeklyRiskLevel = signalKinds >= 2 ? 'high' : signalKinds === 1 ? 'medium' : 'normal';
    return {
      categoryId: cat.categoryId,
      category: categoryLabel(cat.categoryId, cat.category),
      newsCount,
      lifecycleCount,
      marketReportCount,
      tone,
      plainText: describeCategorySignal(newsCount, lifecycleCount, marketReportCount),
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

  const riskText = riskLevel === 'high' ? '高' : riskLevel === 'medium' ? '中' : '低';
  const title = `物料預測週報｜${formatDate(start)}｜本週先看這幾類`;

  const summary = riskLevel === 'high'
    ? `本週有幾個類別同時被新聞、PCN/EOL 或市場情報提到，不是立刻代表缺料，但已經值得先拉高注意。重點先看：${focusText}。`
    : riskLevel === 'medium'
      ? `本週訊號不算全面升溫，但有些類別開始被外部消息點名。先不用急著下結論，建議把 ${focusText} 放進追蹤清單。`
      : '本週外部訊號相對安靜，暫時沒有看到需要立刻升級處理的類別。';

  const openingNotes = [
    riskLevel === 'high'
      ? `本週最值得先看的是 ${focusText}。這些類別不是單一來源提到，而是同時出現在新聞、PCN/EOL 或市場情報裡，適合先進入採購與工程的觀察清單。`
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
        .map((item: any) => `${item.source || '市場情報'}：${item.summaryZh || item.evidenceTextZh || item.titleZh || item.title || '市場情報提到此類別'}`),
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
    title: report.titleZh || report.title || '未命名市場情報',
    source: report.source || '市場情報',
    url: report.url || '#',
    publishedAt: report.publishedAt || null,
    summary: report.summaryZh || report.evidenceTextZh || report.evidenceText || '',
  }));

  const recommendedActions = riskLevel === 'high'
    ? [
        '採購：先不用全線緊張，但請把被多個來源提到的類別拉出來問交期和可供量。',
        '工程：如果這些類別剛好在新案或熱賣案裡，先看一下替代料和 AVL 有沒有準備好。',
        'PM / 業務：如果客戶近期有拉貨或需求上修，請先提醒供應鏈，不要等到料號層級才處理。',
      ]
    : riskLevel === 'medium'
      ? [
          '採購：先追蹤被點名的類別，不需要大動作，但下週要看訊號有沒有增加。',
          '工程：先確認是否有專案用到這些類別，若有，再往料號層級追。',
          'PM / 業務：若有急單或 forecast 上修，請特別標註相關類別。',
        ]
      : [
          '本週可以維持例行監控，不需要額外升級。',
          '下週繼續看外部新聞、PCN/EOL 和市場情報是否有連續出現。',
        ];

  return {
    id,
    title,
    href: `/demand-forecast/weekly-reports/${id}`,
    date: formatDate(start),
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
