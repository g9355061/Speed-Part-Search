import { CATEGORY_NEWS_KEYWORDS } from './benchmark';

/**
 * 新聞類別關鍵字比對（單一事實來源，route.ts 與 weekly-report.ts 共用）
 *
 * 2026-09-12 修正：原本用 `text.includes(keyword)` 子字串比對，正式站實測誤中嚴重——
 *   C07 `clock` 命中 Overclocking.com、C08 `tvs` 命中 "TVs"（電視價格新聞）、
 *   C15 `fan`/`cooling` 命中尼泊爾救援設備與冰箱處理新聞，還被拿去當封面故事素材。
 * 規則：
 *   1. 純 ASCII 關鍵字一律字邊界比對（\bclock\b 不會命中 overclocking）。
 *   2. 4 字以內的 ASCII 縮寫（TVS、ESD、DDR、NOR、PSU…）要求原文大寫：
 *      小寫 "tvs" 是電視、"nor" 是連接詞，只有大寫才是元件。
 *   3. 含中文的關鍵字維持子字串比對（中文沒有字邊界）。
 *   4. 允許複數與縮寫後接數字（MCUs、DDR5、HBM3E），但縮寫後不能接字母（RAMageddon 不算 RAM）。
 */

const regexCache = new Map<string, RegExp>();

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keywordRegex(keyword: string): RegExp | null {
  const cached = regexCache.get(keyword);
  if (cached) return cached;
  if (!/^[\x20-\x7e]+$/.test(keyword)) return null; // 含非 ASCII → 用 includes
  const isShortAcronym = /^[a-z]{1,4}$/i.test(keyword);
  // 允許複數（MCUs、connectors）；縮寫後面允許接數字／世代（DDR5、HBM3E），但不能接字母（RAMageddon）
  const tail = isShortAcronym ? '(?:s)?(?![A-Za-z])' : '(?:s|es)?(?![A-Za-z0-9])';
  const pattern = `(?<![A-Za-z0-9])${escapeRegex(isShortAcronym ? keyword.toUpperCase() : keyword)}${tail}`;
  const regex = new RegExp(pattern, isShortAcronym ? '' : 'i');
  regexCache.set(keyword, regex);
  return regex;
}

/** 單一關鍵字是否命中原文（傳原文，不要先 toLowerCase——縮寫規則需要大小寫） */
export function keywordMatches(text: string, keyword: string): boolean {
  const regex = keywordRegex(keyword);
  if (regex) return regex.test(text);
  return text.toLowerCase().includes(keyword.toLowerCase());
}

/** 原文是否命中該類別任一關鍵字 */
export function matchesCategory(text: string, categoryId: string): boolean {
  const keywords = CATEGORY_NEWS_KEYWORDS[categoryId] ?? [];
  return keywords.some((keyword) => keywordMatches(text, keyword));
}

/** 回傳原文命中的所有類別 */
export function detectCategories(text: string): string[] {
  return Object.keys(CATEGORY_NEWS_KEYWORDS).filter((categoryId) => matchesCategory(text, categoryId));
}

/**
 * 股票評論／投資快訊網站：內容是股價與買賣建議，不是供應鏈消息，
 * 但標題常帶 "shortage"，Google News 一抓就進來（正式站實測 timothysykes、StocksToTrade 等）。
 */
const BLOCKED_NEWS_SOURCES = [
  'timothysykes', 'stockstotrade', 'cryptorank', 'tradingview', 'marketbeat',
  '247wallst', '24/7 wall st', 'zacks', 'fool.com', 'motley fool', 'benzinga',
  'investorplace', 'tickerreport', 'americanbankingnews', 'stocktitan', 'simplywall',
  'insidermonkey', 'gurufocus', 'ainvest',
];

export function isBlockedNewsSource(source: string | undefined, link?: string | undefined): boolean {
  const haystack = `${source ?? ''} ${link ?? ''}`.toLowerCase().replace(/\s+/g, ' ');
  return BLOCKED_NEWS_SOURCES.some((blocked) => haystack.includes(blocked));
}
