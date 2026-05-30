import { NextRequest, NextResponse } from 'next/server';
import { BENCHMARK_PARTS, DEMAND_CATEGORIES, BenchmarkPart, CATEGORY_THRESHOLDS } from '@/lib/demand-forecast/benchmark';
import { getEnabledSuppliers } from '@/lib/suppliers/registry';
import { PartResult, SupplierError } from '@/lib/suppliers/types';
import fs from 'fs';
import path from 'path';
import { getDemandForecastCache, setDemandForecastCache, saveDemandForecastSnapshot, getDemandForecastSnapshot7DaysAgo } from '@/lib/db';

export const dynamic = 'force-dynamic';

const CACHE_DIR = path.join(process.cwd(), 'data');
const CACHE_PATH = path.join(CACHE_DIR, 'demand-forecast-cache.json');

async function readCache(): Promise<{ updatedAt: string; parts: any[]; categorySummary: any[] } | null> {
  try {
    const dbCache = await getDemandForecastCache();
    if (dbCache) return dbCache;
  } catch (err) {
    console.error('[CACHE] Failed to read database cache, falling back to file:', err);
  }

  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const raw = fs.readFileSync(CACHE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[CACHE] Failed to read demand forecast cache file:', err);
    return null;
  }
}

async function writeCache(data: { updatedAt: string; parts: any[]; categorySummary: any[] }) {
  try {
    await setDemandForecastCache(data);
  } catch (err) {
    console.error('[CACHE] Failed to write database cache:', err);
  }

  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[CACHE] Failed to write demand forecast cache file:', err);
  }
}

const RISK_WORDS = [
  'shortage', 'allocation', 'allocated', 'tight supply', 'lead time', 'leadtime',
  'price hike', 'price increase', 'supply constraint', 'backlog', 'capacity tight',
  'scarce', 'undersupply', 'stockout', 'eol', 'pcn',
];

const LIFECYCLE_WORDS = [
  'pcn', 'eol', 'nrnd', 'end of life', 'end-of-life', 'last time buy',
  'product change notification', 'product discontinuance', 'obsolete', 'obsolescence',
];

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  C01: ['mlcc', 'ceramic capacitor', 'murata', 'tdk', 'samsung electro-mechanics'],
  C02: ['pmic', 'power management', 'regulator', 'buck converter', 'ldo', 'texas instruments'],
  C03: ['mosfet', 'power discrete', 'infineon', 'onsemi', 'vishay'],
  C04: ['ddr', 'dram', 'memory', 'flash', 'nand', 'nor', 'hbm', 'micron', 'sk hynix', 'samsung'],
  C05: ['mcu', 'microcontroller', 'automotive mcu', 'stm32', 'nxp', 'renesas', 'infineon aurix'],
  C06: ['connector', 'fpc', 'ffc', 'board-to-board', 'wire-to-board', 'te connectivity', 'molex', 'hirose'],
  C07: ['crystal', 'oscillator', 'clock', 'timing component'],
  C08: ['tvs', 'esd protection', 'surge protection', 'protection diode'],
  C09: ['analog ic', 'sensor', 'op amp', 'current sensor', 'temperature sensor'],
  C10: ['interface ic', 'can transceiver', 'rs-485', 'usb bridge', 'ethernet phy'],
  C11: ['inductor', 'choke', 'power inductor', 'common mode choke'],
  C12: ['aluminum capacitor', 'polymer capacitor', 'electrolytic capacitor'],
  C13: ['optocoupler', 'digital isolator', 'isolation ic'],
  C14: ['ethernet', 'networking ic', 'phy', 'switch ic', 'retimer'],
  C15: ['fan', 'thermal', 'cooling', 'power module', 'dc dc module', 'ac dc module'],
};

const CATEGORY_SEARCH_QUERIES: Record<string, string[]> = {
  C01: ['MLCC', '"ceramic capacitor"', '"multilayer ceramic capacitor"'],
  C02: ['PMIC', '"power management IC"', '"buck regulator"', '"voltage regulator"'],
  C03: ['MOSFET', '"power discrete"', '"power semiconductor"'],
  C04: ['DDR', 'DRAM', 'HBM', '"memory chip"', '"NOR flash"'],
  C05: ['MCU', 'microcontroller', '"automotive MCU"', 'STM32', 'Renesas'],
  C06: ['connector', '"board-to-board connector"', '"FPC connector"', '"wire-to-board connector"'],
  C07: ['crystal', 'oscillator', '"timing component"'],
  C08: ['TVS', '"ESD protection"', '"protection diode"'],
  C09: ['"analog IC"', 'sensor', '"op amp"', '"current sensor"'],
  C10: ['"interface IC"', '"CAN transceiver"', 'RS-485', '"Ethernet PHY"'],
  C11: ['inductor', 'choke', '"power inductor"'],
  C12: ['"aluminum capacitor"', '"polymer capacitor"', '"electrolytic capacitor"'],
  C13: ['optocoupler', '"digital isolator"', '"isolation IC"'],
  C14: ['Ethernet', '"networking IC"', '"Ethernet PHY"', 'retimer'],
  C15: ['fan', 'thermal', 'cooling', '"power module"', '"DC DC module"'],
};

interface NewsItem {
  title: string;
  titleZh: string;
  link: string;
  source: string;
  publishedAt: string;
  snippet: string;
  snippetZh: string;
  categoryIds: string[];
  riskHit: boolean;
}

const PHRASE_TRANSLATIONS: Array<[RegExp, string]> = [
  [/\bAI\b/gi, 'AI'],
  [/\bMLCC\b/gi, 'MLCC'],
  [/\bPMIC\b/gi, 'PMIC'],
  [/\bDDR\b/gi, 'DDR'],
  [/\bDRAM\b/gi, 'DRAM'],
  [/\bHBM\b/gi, 'HBM'],
  [/\bMCU\b/gi, 'MCU'],
  [/\bMOSFETs?\b/gi, 'MOSFET'],
  [/\bshortages?\b/gi, '缺料'],
  [/\ballocation\b/gi, '配給'],
  [/\btight supply\b/gi, '供應吃緊'],
  [/\blead times?\b/gi, '交期'],
  [/\bprice hikes?\b/gi, '漲價'],
  [/\bprice increases?\b/gi, '漲價'],
  [/\bsupply chain\b/gi, '供應鏈'],
  [/\bsupply\b/gi, '供應'],
  [/\bdemand\b/gi, '需求'],
  [/\bcapacitors?\b/gi, '電容'],
  [/\bceramic capacitors?\b/gi, '陶瓷電容'],
  [/\bconnectors?\b/gi, '連接器'],
  [/\binductors?\b/gi, '電感'],
  [/\bcrystals?\b/gi, '晶體'],
  [/\boscillators?\b/gi, '振盪器'],
  [/\bsemiconductors?\b/gi, '半導體'],
  [/\bmemory\b/gi, '記憶體'],
  [/\bflash\b/gi, 'Flash'],
  [/\bpower\b/gi, '電源'],
  [/\bmanagement\b/gi, '管理'],
  [/\bregulators?\b/gi, '穩壓器'],
  [/\bdrives?\b/gi, '推動'],
  [/\bglobal\b/gi, '全球'],
  [/\braise prices?\b/gi, '提高價格'],
  [/\bmoves to raise prices?\b/gi, '計畫提高價格'],
  [/\bdeepens?\b/gi, '加深'],
  [/\bwill deepen\b/gi, '將加深'],
];

function roughTranslateZh(text: string): string {
  let output = decodeXml(text);
  for (const [pattern, replacement] of PHRASE_TRANSLATIONS) {
    output = output.replace(pattern, replacement);
  }
  return output;
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tagCategories(text: string): string[] {
  const lower = text.toLowerCase();
  return DEMAND_CATEGORIES
    .filter((cat) => CATEGORY_KEYWORDS[cat.categoryId]?.some((word) => lower.includes(word)))
    .map((cat) => cat.categoryId);
}

function parseGoogleNews(xml: string, requestedCategoryId?: string, signalWords: string[] = RISK_WORDS): NewsItem[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  return items.slice(0, 60).map((match) => {
    const block = match[1];
    const title = decodeXml(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
    const link = decodeXml(block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '');
    const pubDate = decodeXml(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? '');
    const source = decodeXml(block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? 'Google News');
    const snippet = decodeXml(block.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? '');
    const text = `${title} ${snippet}`;
    const detectedCategoryIds = tagCategories(text);
    const categoryIds = requestedCategoryId && !detectedCategoryIds.includes(requestedCategoryId)
      ? [requestedCategoryId, ...detectedCategoryIds]
      : detectedCategoryIds;
    return {
      title,
      titleZh: roughTranslateZh(title),
      link,
      source,
      publishedAt: pubDate,
      snippet,
      snippetZh: roughTranslateZh(snippet),
      categoryIds,
      riskHit: signalWords.some((word) => text.toLowerCase().includes(word)),
    };
  }).filter((item) => item.title && item.link);
}

function buildCategoryNewsUrl(categoryId: string, kind: 'shortage' | 'lifecycle'): string {
  const terms = CATEGORY_SEARCH_QUERIES[categoryId] ?? CATEGORY_KEYWORDS[categoryId] ?? [];
  const signalQuery = kind === 'lifecycle'
    ? '(PCN OR EOL OR NRND OR "end of life" OR "last time buy" OR "product change notification" OR "product discontinuance")'
    : '(shortage OR allocation OR "lead time" OR "price increase" OR "tight supply")';
  const query = [
    'electronic components',
    signalQuery,
    `(${terms.join(' OR ')})`,
    'when:14d',
  ].join(' ');
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

async function fetchCategoryNews(categoryId: string): Promise<NewsItem[]> {
  const url = buildCategoryNewsUrl(categoryId, 'shortage');
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'SpeedPart Demand Forecast/1.0' },
    next: { revalidate: 1800 },
  });
  if (!resp.ok) return [];
  const xml = await resp.text();
  return parseGoogleNews(xml, categoryId).filter((item) => item.riskHit || item.categoryIds.length > 0);
}

async function fetchCategoryLifecycleNews(categoryId: string): Promise<NewsItem[]> {
  const url = buildCategoryNewsUrl(categoryId, 'lifecycle');
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'SpeedPart Demand Forecast/1.0' },
    next: { revalidate: 1800 },
  });
  if (!resp.ok) return [];
  const xml = await resp.text();
  return parseGoogleNews(xml, categoryId, LIFECYCLE_WORDS).filter((item) => item.riskHit || item.categoryIds.length > 0);
}

function mergeNewsItems(items: NewsItem[]): NewsItem[] {
  const seen = new Map<string, NewsItem>();

  for (const item of items) {
    const existing = seen.get(item.link);
    if (!existing) {
      seen.set(item.link, item);
      continue;
    }

    seen.set(item.link, {
      ...existing,
      categoryIds: Array.from(new Set([...existing.categoryIds, ...item.categoryIds])),
      riskHit: existing.riskHit || item.riskHit,
    });
  }

  return Array.from(seen.values()).filter((item) => item.riskHit || item.categoryIds.length > 0);
}

const resolvedUrlCache = new Map<string, string>();

async function getDecodingParams(base64Str: string) {
  try {
    const url = `https://news.google.com/articles/${base64Str}`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
      },
      next: { revalidate: 3600 }
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    
    const sgMatch = text.match(/data-n-a-sg="([^"]+)"/);
    const tsMatch = text.match(/data-n-a-ts="([^"]+)"/);
    
    if (sgMatch && tsMatch) {
      return {
        signature: sgMatch[1],
        timestamp: tsMatch[1],
        base64Str
      };
    }
  } catch (err) {
    console.warn("[DECODER] Failed to get decoding params from articles page, trying RSS fallback...", err);
  }
  
  const url = `https://news.google.com/rss/articles/${base64Str}`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
    },
    next: { revalidate: 3600 }
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} on fallback`);
  const text = await resp.text();
  
  const sgMatch = text.match(/data-n-a-sg="([^"]+)"/);
  const tsMatch = text.match(/data-n-a-ts="([^"]+)"/);
  
  if (!sgMatch || !tsMatch) {
    throw new Error("Failed to find data-n-a-sg or data-n-a-ts in response");
  }
  
  return {
    signature: sgMatch[1],
    timestamp: tsMatch[1],
    base64Str
  };
}

async function decodeUrl(signature: string, timestamp: string, base64Str: string) {
  const url = "https://news.google.com/_/DotsSplashUi/data/batchexecute";
  const payload = [
    "Fbv4je",
    `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${base64Str}",${timestamp},"${signature}"]`
  ];
  
  const fReq = JSON.stringify([[payload]]);
  const body = "f.req=" + encodeURIComponent(fReq);
  
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
    },
    body
  });
  
  if (!resp.ok) throw new Error(`HTTP error ${resp.status}`);
  const text = await resp.text();
  
  const parts = text.split("\n\n");
  if (parts.length < 2) throw new Error("Invalid batchexecute response structure");
  
  const data = JSON.parse(parts[1]);
  const innerDataStr = data[0][2];
  const innerData = JSON.parse(innerDataStr);
  const decodedUrl = innerData[1];
  return decodedUrl;
}

async function decodeGoogleNewsUrl(sourceUrl: string): Promise<string> {
  if (resolvedUrlCache.has(sourceUrl)) {
    return resolvedUrlCache.get(sourceUrl)!;
  }
  try {
    const url = new URL(sourceUrl);
    const path = url.pathname.split("/");
    let base64Str = "";
    if (
      url.hostname === "news.google.com" &&
      path.length > 1 &&
      (path[path.length - 2] === "articles" || path[path.length - 2] === "read")
    ) {
      base64Str = path[path.length - 1];
    } else {
      return sourceUrl;
    }
    
    const params = await getDecodingParams(base64Str);
    const decoded = await decodeUrl(params.signature, params.timestamp, params.base64Str);
    if (decoded) {
      resolvedUrlCache.set(sourceUrl, decoded);
      return decoded;
    }
    return sourceUrl;
  } catch (err) {
    console.error("[DECODER] decodeGoogleNewsUrl failed for:", sourceUrl, err);
    return sourceUrl;
  }
}

const translationCache = new Map<string, string>();

async function translateToZh(text: string): Promise<string> {
  if (!text) return "";
  const cleaned = text.trim();
  if (!cleaned) return "";
  if (translationCache.has(cleaned)) {
    console.log("[TRANSLATOR] Cache hit for:", cleaned.substring(0, 20) + "...");
    return translationCache.get(cleaned)!;
  }
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-TW&dt=t&q=${encodeURIComponent(cleaned)}`;
    console.log("[TRANSLATOR] Requesting translation for:", cleaned.substring(0, 20) + "...");
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      next: { revalidate: 3600 }
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    const translated = json[0].map((item: any) => item[0]).join('');
    if (translated) {
      console.log("[TRANSLATOR] Success! Translated to:", translated.substring(0, 20) + "...");
      translationCache.set(cleaned, translated);
      return translated;
    }
    return roughTranslateZh(cleaned);
  } catch (err) {
    console.error("[TRANSLATOR] Failed to translate:", cleaned, err);
    return roughTranslateZh(cleaned);
  }
}

async function fetchIndustryNews(): Promise<NewsItem[]> {
  const perCategory = await runWithConcurrency(DEMAND_CATEGORIES, 5, (cat) => fetchCategoryNews(cat.categoryId));
  const merged = mergeNewsItems(perCategory.flat());
  const decoded = await runWithConcurrency(merged, 4, async (item) => {
    if (item.riskHit) {
      const [decodedLink, translatedTitle, translatedSnippet] = await Promise.all([
        decodeGoogleNewsUrl(item.link),
        translateToZh(item.title),
        translateToZh(item.snippet)
      ]);
      return { 
        ...item, 
        link: decodedLink,
        titleZh: translatedTitle || item.titleZh,
        snippetZh: translatedSnippet || item.snippetZh
      };
    }
    return item;
  });
  return decoded;
}

async function fetchLifecycleNews(): Promise<NewsItem[]> {
  const perCategory = await runWithConcurrency(DEMAND_CATEGORIES, 5, (cat) => fetchCategoryLifecycleNews(cat.categoryId));
  const merged = mergeNewsItems(perCategory.flat());
  const decoded = await runWithConcurrency(merged, 4, async (item) => {
    if (item.riskHit) {
      const [decodedLink, translatedTitle, translatedSnippet] = await Promise.all([
        decodeGoogleNewsUrl(item.link),
        translateToZh(item.title),
        translateToZh(item.snippet)
      ]);
      return { 
        ...item, 
        link: decodedLink,
        titleZh: translatedTitle || item.titleZh,
        snippetZh: translatedSnippet || item.snippetZh
      };
    }
    return item;
  });
  return decoded;
}

function bestResult(results: PartResult[]): PartResult | null {
  if (results.length === 0) return null;
  return [...results].sort((a, b) => {
    const stockDelta = b.quantityAvailable - a.quantityAvailable;
    if (stockDelta !== 0) return stockDelta;
    const priceA = a.unitPrice ?? Number.POSITIVE_INFINITY;
    const priceB = b.unitPrice ?? Number.POSITIVE_INFINITY;
    return priceA - priceB;
  })[0] ?? null;
}

function summarizePart(part: BenchmarkPart, results: PartResult[], errors: string[], snapshot7DaysAgo?: any) {
  const best = bestResult(results);
  const totalStock = results.reduce((sum, item) => sum + Math.max(0, item.quantityAvailable || 0), 0);
  const supplierCount = new Set(results.map((item) => item.supplier)).size;
  const leadTimes = results
    .map((item) => item.leadTimeDays)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const maxLeadTimeDays = leadTimes.length ? Math.max(...leadTimes) : null;
  const minLeadTimeDays = leadTimes.length ? Math.min(...leadTimes) : null;
  const hasApiMatch = supplierCount > 0;

  const lowestPriceUsd = results
    .map((item) => item.unitPrice)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .sort((a, b) => a - b)[0] ?? null;

  const thresholds = CATEGORY_THRESHOLDS[part.categoryId] || { minStock: 1000, lowStock: 5000 };
  const noStockAfterMatch = hasApiMatch && totalStock <= 0;
  const veryLongLead = minLeadTimeDays !== null && minLeadTimeDays >= 140; // >= 20 weeks
  const mediumLead = minLeadTimeDays !== null && minLeadTimeDays >= 84;   // >= 12 weeks

  // Trend analysis calculations
  const stockDrop50 = snapshot7DaysAgo && snapshot7DaysAgo.totalStock > 0 && ((snapshot7DaysAgo.totalStock - totalStock) / snapshot7DaysAgo.totalStock) >= 0.5;
  const stockDrop80 = snapshot7DaysAgo && snapshot7DaysAgo.totalStock > 0 && ((snapshot7DaysAgo.totalStock - totalStock) / snapshot7DaysAgo.totalStock) >= 0.8;
  const supplierDrop = snapshot7DaysAgo && snapshot7DaysAgo.supplierCount >= 3 && supplierCount === 1;
  const priceRise30 = snapshot7DaysAgo && snapshot7DaysAgo.lowestPriceUsd !== null && lowestPriceUsd !== null && lowestPriceUsd > 0 && ((lowestPriceUsd - snapshot7DaysAgo.lowestPriceUsd) / snapshot7DaysAgo.lowestPriceUsd) >= 0.3;
  const leadTimeIncrease56 = snapshot7DaysAgo && snapshot7DaysAgo.minLeadTimeDays !== null && minLeadTimeDays !== null && (minLeadTimeDays - snapshot7DaysAgo.minLeadTimeDays) >= 56;

  // Three-tier risk: High Risk > Medium Risk > Normal
  // High Risk: No stock OR Stock is below lowStock threshold AND replenishment lead time is very long (>= 20 weeks) OR stock drop > 80%
  const highRisk = noStockAfterMatch || (totalStock < thresholds.lowStock && veryLongLead) || !!(snapshot7DaysAgo && stockDrop80);
  // Medium Risk: Stock is below minStock threshold (always medium risk) OR Stock is below lowStock threshold AND lead time is medium (>= 12 weeks) OR other trend warnings
  const mediumRisk = !highRisk && (
    (totalStock < thresholds.minStock) ||
    (totalStock < thresholds.lowStock && mediumLead) ||
    !!(snapshot7DaysAgo && (stockDrop50 || supplierDrop || priceRise30 || leadTimeIncrease56))
  );

  const riskLevel: '高風險' | '中風險' | '正常' | '無資料' = !hasApiMatch ? '無資料' : highRisk ? '高風險' : mediumRisk ? '中風險' : '正常';

  return {
    ...part,
    description: best?.description ?? '',
    apiManufacturer: best?.manufacturer ?? '',
    supplierCount,
    totalStock,
    lowestPriceUsd,
    maxLeadTimeDays,
    minLeadTimeDays,
    availabilityStatus: best?.availabilityStatus ?? '',
    productUrl: best?.productUrl ?? '',
    checkedSuppliers: results.map((item) => item.supplier),
    errors,
    riskLevel,
    summary: highRisk ? '有缺料風險' : mediumRisk ? '中風險' : (hasApiMatch ? '正常' : '無代理商資料'),
    riskReasons: [
      !hasApiMatch ? 'API 未找到此料，無授權代理商通路資料' : '',
      noStockAfterMatch ? '🔴 API 找到料件但授權供應商庫存為 0' : '',
      (totalStock < thresholds.lowStock && veryLongLead) ? `🔴 庫存不足 ${thresholds.lowStock.toLocaleString()} 且補貨最短交期達 ${Math.round(minLeadTimeDays! / 7)} 週（超過 20 週）` : '',
      (snapshot7DaysAgo && stockDrop80) ? `🔴 趨勢警告：庫存 7 天內暴跌超過 80%（自 ${snapshot7DaysAgo.totalStock.toLocaleString()} 降至 ${totalStock.toLocaleString()}）` : '',
      (totalStock < thresholds.lowStock && mediumLead && !veryLongLead) ? `🟡 庫存不足 ${thresholds.lowStock.toLocaleString()} 且補貨最短交期達 ${Math.round(minLeadTimeDays! / 7)} 週` : '',
      (totalStock < thresholds.minStock && totalStock > 0 && !veryLongLead && !mediumLead) ? `🟡 庫存僅 ${totalStock.toLocaleString()} 顆（低於安全水位 ${thresholds.minStock.toLocaleString()}）` : '',
      (snapshot7DaysAgo && stockDrop50 && !stockDrop80) ? `🟡 趨勢警告：庫存 7 天內下降超過 50%（自 ${snapshot7DaysAgo.totalStock.toLocaleString()} 降至 ${totalStock.toLocaleString()}）` : '',
      (snapshot7DaysAgo && supplierDrop) ? `🟡 趨勢警告：可用授權分銷商數量自 ${snapshot7DaysAgo.supplierCount} 家減至 1 家` : '',
      (snapshot7DaysAgo && priceRise30) ? `🟡 趨勢警告：最低報價 7 天內上漲超過 30%（自 $${snapshot7DaysAgo.lowestPriceUsd.toFixed(4)} 漲至 $${lowestPriceUsd.toFixed(4)}）` : '',
      (snapshot7DaysAgo && leadTimeIncrease56) ? `🟡 趨勢警告：補貨最短交期 7 天內拉長超過 ${Math.round((minLeadTimeDays! - snapshot7DaysAgo.minLeadTimeDays!) / 7)} 週` : '',
    ].filter(Boolean),
  };
}

async function runWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = items[index++];
      results.push(await task(current));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function searchBenchmarkPart(part: BenchmarkPart) {
  const suppliers = getEnabledSuppliers();
  const results: PartResult[] = [];
  const errors: string[] = [];

  await Promise.all(suppliers.map(async (supplier) => {
    try {
      const found = await supplier.search({ partNumber: part.mpn });
      results.push(...found);
    } catch (err) {
      if (err instanceof SupplierError) {
        errors.push(`${err.supplier}: ${err.code}`);
      } else {
        errors.push(`${supplier.name}: ERROR`);
      }
    }
  }));

  const snapshot7DaysAgo = await getDemandForecastSnapshot7DaysAgo(part.mpn);
  const summary = summarizePart(part, results, errors, snapshot7DaysAgo);

  // 儲存今日快照以供後續比對趨勢
  await saveDemandForecastSnapshot(
    part.mpn,
    summary.totalStock,
    summary.supplierCount,
    summary.lowestPriceUsd,
    summary.minLeadTimeDays,
    summary.maxLeadTimeDays,
    summary.riskLevel
  );

  return summary;
}

type ForecastPartResult = ReturnType<typeof summarizePart>;

function buildNewsCategorySummary(news: NewsItem[]) {
  return DEMAND_CATEGORIES.map((cat) => {
    const items = news.filter((item) => item.categoryIds.includes(cat.categoryId));
    const riskCount = items.filter((item) => item.riskHit).length;
    // Require ≥2 risk news items to flag a category (reduces false positives)
    const isRisk = riskCount >= 2;
    return {
      ...cat,
      newsCount: items.length,
      riskNewsCount: riskCount,
      summary: isRisk ? '有缺料風險' : '正常',
    };
  });
}

function buildSupplyCategorySummary(parts: ForecastPartResult[]) {
  return DEMAND_CATEGORIES.map((cat) => {
    const items = parts.filter((part) => part.categoryId === cat.categoryId);
    const highRiskParts = items.filter((part) => part.riskLevel === '高風險');
    const medRiskParts = items.filter((part) => part.riskLevel === '中風險');
    const riskParts = items.filter((part) => part.riskLevel === '高風險' || part.riskLevel === '中風險');
    const checkedParts = items.filter((part) => part.supplierCount > 0);
    const totalStock = items.reduce((sum, part) => sum + part.totalStock, 0);
    const supplierCounts = items.map((part) => part.supplierCount).filter((n) => n > 0);
    const leadTimes = items
      .map((part) => part.maxLeadTimeDays)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const riskRatio = checkedParts.length ? riskParts.length / checkedParts.length : 0;
    const categoryHighRisk = highRiskParts.length >= 3 || (checkedParts.length >= 5 && riskRatio >= 0.4);
    const categoryMedRisk = !categoryHighRisk && (highRiskParts.length >= 1 || medRiskParts.length >= 3);

    return {
      ...cat,
      newsCount: checkedParts.length,
      riskNewsCount: riskParts.length,
      checkedPartCount: checkedParts.length,
      riskPartCount: riskParts.length,
      highRiskPartCount: highRiskParts.length,
      medRiskPartCount: medRiskParts.length,
      totalStock,
      avgSupplierCount: supplierCounts.length
        ? Math.round((supplierCounts.reduce((sum, n) => sum + n, 0) / supplierCounts.length) * 10) / 10
        : 0,
      maxLeadTimeDays: leadTimes.length ? Math.max(...leadTimes) : null,
      summary: categoryHighRisk ? '有缺料風險' : categoryMedRisk ? '中風險' : '正常',
    };
  });
}

const NEWS_CACHE_PATH = path.join(CACHE_DIR, 'news-cache.json');

interface NewsCache {
  updatedAt: string;
  news: NewsItem[];
  lifecycleNews: NewsItem[];
  newsCategorySummary: ReturnType<typeof buildNewsCategorySummary>;
  lifecycleCategorySummary: ReturnType<typeof buildNewsCategorySummary>;
}

let memoryNewsCache: NewsCache | null = null;

async function readNewsCache(): Promise<NewsCache | null> {
  if (memoryNewsCache) return memoryNewsCache;
  try {
    if (!fs.existsSync(NEWS_CACHE_PATH)) return null;
    const raw = fs.readFileSync(NEWS_CACHE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as NewsCache;
    memoryNewsCache = parsed;
    return parsed;
  } catch {
    return null;
  }
}

async function writeNewsCache(data: NewsCache) {
  memoryNewsCache = data;
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(NEWS_CACHE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[NEWS_CACHE] Failed to write:', err);
  }
}

async function fetchAndCacheNews(): Promise<NewsCache> {
  const [news, lifecycleNews] = await Promise.all([fetchIndustryNews(), fetchLifecycleNews()]);
  const newsCategorySummary = buildNewsCategorySummary(news);
  const lifecycleCategorySummary = buildNewsCategorySummary(lifecycleNews);
  const cache: NewsCache = {
    updatedAt: new Date().toISOString(),
    news,
    lifecycleNews,
    newsCategorySummary,
    lifecycleCategorySummary,
  };
  await writeNewsCache(cache);
  return cache;
}

async function recalculateForecastPart(part: any) {
  if (part.summary === '尚未查詢' || part.supplierCount === null || part.supplierCount === undefined) {
    return part;
  }

  const hasApiMatch = part.supplierCount > 0;
  const totalStock = part.totalStock ?? 0;
  const minLeadTimeDays = part.minLeadTimeDays ?? null;
  const lowestPriceUsd = part.lowestPriceUsd ?? null;

  const thresholds = CATEGORY_THRESHOLDS[part.categoryId] || { minStock: 1000, lowStock: 5000 };
  const noStockAfterMatch = hasApiMatch && totalStock <= 0;
  const veryLongLead = minLeadTimeDays !== null && minLeadTimeDays >= 140; // >= 20 weeks
  const mediumLead = minLeadTimeDays !== null && minLeadTimeDays >= 84;   // >= 12 weeks

  let snapshot7DaysAgo: any = null;
  try {
    snapshot7DaysAgo = await getDemandForecastSnapshot7DaysAgo(part.mpn);
  } catch (err) {
    console.error(`[RECALC] Failed to load snapshot for ${part.mpn}:`, err);
  }

  const stockDrop50 = snapshot7DaysAgo && snapshot7DaysAgo.totalStock > 0 && ((snapshot7DaysAgo.totalStock - totalStock) / snapshot7DaysAgo.totalStock) >= 0.5;
  const stockDrop80 = snapshot7DaysAgo && snapshot7DaysAgo.totalStock > 0 && ((snapshot7DaysAgo.totalStock - totalStock) / snapshot7DaysAgo.totalStock) >= 0.8;
  const supplierDrop = snapshot7DaysAgo && snapshot7DaysAgo.supplierCount >= 3 && part.supplierCount === 1;
  const priceRise30 = snapshot7DaysAgo && snapshot7DaysAgo.lowestPriceUsd !== null && lowestPriceUsd !== null && lowestPriceUsd > 0 && ((lowestPriceUsd - snapshot7DaysAgo.lowestPriceUsd) / snapshot7DaysAgo.lowestPriceUsd) >= 0.3;
  const leadTimeIncrease56 = snapshot7DaysAgo && snapshot7DaysAgo.minLeadTimeDays !== null && minLeadTimeDays !== null && (minLeadTimeDays - snapshot7DaysAgo.minLeadTimeDays) >= 56;

  const highRisk = noStockAfterMatch || (totalStock < thresholds.lowStock && veryLongLead) || !!(snapshot7DaysAgo && stockDrop80);
  const mediumRisk = !highRisk && (
    (totalStock < thresholds.minStock) ||
    (totalStock < thresholds.lowStock && mediumLead) ||
    !!(snapshot7DaysAgo && (stockDrop50 || supplierDrop || priceRise30 || leadTimeIncrease56))
  );

  const riskLevel: '高風險' | '中風險' | '正常' | '無資料' = !hasApiMatch ? '無資料' : highRisk ? '高風險' : mediumRisk ? '中風險' : '正常';
  const summary = highRisk ? '有缺料風險' : mediumRisk ? '中風險' : (hasApiMatch ? '正常' : '無代理商資料');

  const riskReasons = [
    !hasApiMatch ? 'API 未找到此料，無授權代理商通路資料' : '',
    noStockAfterMatch ? '🔴 API 找到料件但授權供應商庫存為 0' : '',
    (totalStock < thresholds.lowStock && veryLongLead) ? `🔴 庫存不足 ${thresholds.lowStock.toLocaleString()} 且補貨最短交期達 ${Math.round(minLeadTimeDays! / 7)} 週（超過 20 週）` : '',
    (snapshot7DaysAgo && stockDrop80) ? `🔴 趨勢警告：庫存 7 天內暴跌超過 80%（自 ${snapshot7DaysAgo.totalStock.toLocaleString()} 降至 ${totalStock.toLocaleString()}）` : '',
    (totalStock < thresholds.lowStock && mediumLead && !veryLongLead) ? `🟡 庫存不足 ${thresholds.lowStock.toLocaleString()} 且補貨最短交期達 ${Math.round(minLeadTimeDays! / 7)} 週` : '',
    (totalStock < thresholds.minStock && totalStock > 0 && !veryLongLead && !mediumLead) ? `🟡 庫存僅 ${totalStock.toLocaleString()} 顆（低於安全水位 ${thresholds.minStock.toLocaleString()}）` : '',
    (snapshot7DaysAgo && stockDrop50 && !stockDrop80) ? `🟡 趨勢警告：庫存 7 天內下降超過 50%（自 ${snapshot7DaysAgo.totalStock.toLocaleString()} 降至 ${totalStock.toLocaleString()}）` : '',
    (snapshot7DaysAgo && supplierDrop) ? `🟡 趨勢警告：可用授權分銷商數量自 ${snapshot7DaysAgo.supplierCount} 家減至 1 家` : '',
    (snapshot7DaysAgo && priceRise30) ? `🟡 趨勢警告：最低報價 7 天內上漲超過 30%（自 $${snapshot7DaysAgo.lowestPriceUsd.toFixed(4)} 漲至 $${lowestPriceUsd.toFixed(4)}）` : '',
    (snapshot7DaysAgo && leadTimeIncrease56) ? `🟡 趨勢警告：補貨最短交期 7 天內拉長超過 ${Math.round((minLeadTimeDays! - snapshot7DaysAgo.minLeadTimeDays!) / 7)} 週` : '',
  ].filter(Boolean);

  return {
    ...part,
    riskLevel,
    summary,
    riskReasons,
  };
}

async function recalculatePartsCache(partsCache: any) {
  if (!partsCache || !Array.isArray(partsCache.parts)) return partsCache;

  let changed = false;
  const recalculatedParts = await Promise.all(
    partsCache.parts.map(async (part: any) => {
      const updated = await recalculateForecastPart(part);
      if (
        part.riskLevel !== updated.riskLevel ||
        part.summary !== updated.summary ||
        JSON.stringify(part.riskReasons) !== JSON.stringify(updated.riskReasons)
      ) {
        changed = true;
        return updated;
      }
      return part;
    })
  );

  if (changed) {
    const updatedCategorySummary = buildSupplyCategorySummary(recalculatedParts);
    const updatedCache = {
      ...partsCache,
      parts: recalculatedParts,
      categorySummary: updatedCategorySummary,
    };
    await writeCache(updatedCache);
    return updatedCache;
  }

  return partsCache;
}

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('mode') ?? 'cached';

  // --- mode=cached: return cached data instantly (for page load) ---
  if (mode === 'cached') {
    const newsCache = await readNewsCache();
    let partsCache = await readCache();
    if (partsCache) {
      partsCache = await recalculatePartsCache(partsCache);
    }
    const emptyCategories = DEMAND_CATEGORIES.map((cat) => ({
      ...cat, newsCount: 0, riskNewsCount: 0, checkedPartCount: 0, riskPartCount: 0, summary: '正常' as const,
    }));
    const emptyParts = BENCHMARK_PARTS.map((part) => ({
      ...part, supplierCount: null, totalStock: null, lowestPriceUsd: null, maxLeadTimeDays: null, summary: '尚未查詢', riskReasons: [],
    }));
    return NextResponse.json({
      updatedAt: newsCache?.updatedAt ?? partsCache?.updatedAt ?? new Date().toISOString(),
      mode,
      news: newsCache?.news ?? [],
      lifecycleNews: newsCache?.lifecycleNews ?? [],
      categorySummary: partsCache?.categorySummary ?? emptyCategories,
      newsCategorySummary: newsCache?.newsCategorySummary ?? emptyCategories,
      lifecycleCategorySummary: newsCache?.lifecycleCategorySummary ?? emptyCategories,
      parts: partsCache?.parts ?? emptyParts,
    });
  }

  // --- mode=summary: fetch fresh news, return with cached parts ---
  if (mode === 'summary' || mode !== 'full') {
    const newsData = await fetchAndCacheNews();
    let partsCache = await readCache();
    if (partsCache) {
      partsCache = await recalculatePartsCache(partsCache);
    }
    const emptyCategories = DEMAND_CATEGORIES.map((cat) => ({
      ...cat, newsCount: 0, riskNewsCount: 0, checkedPartCount: 0, riskPartCount: 0, summary: '正常' as const,
    }));
    return NextResponse.json({
      updatedAt: newsData.updatedAt,
      mode,
      news: newsData.news,
      lifecycleNews: newsData.lifecycleNews,
      categorySummary: partsCache?.categorySummary ?? emptyCategories,
      newsCategorySummary: newsData.newsCategorySummary,
      lifecycleCategorySummary: newsData.lifecycleCategorySummary,
      parts: partsCache?.parts ?? BENCHMARK_PARTS.map((part) => ({
        ...part, supplierCount: null, totalStock: null, lowestPriceUsd: null, maxLeadTimeDays: null, summary: '尚未查詢', riskReasons: [],
      })),
    });
  }

  // --- mode=full: fetch fresh news + query all 150 parts ---
  const newsData = await fetchAndCacheNews();

  // Load existing cache to get previously queried parts
  const cached = await readCache();
  const cachedPartsMap = new Map<string, any>();
  if (cached?.parts) {
    for (const p of cached.parts) {
      if (p.mpn) {
        cachedPartsMap.set(p.mpn, p);
      }
    }
  }

  // Pre-populate parts array with cached parts or empty placeholders to preserve order
  const parts: any[] = await Promise.all(
    BENCHMARK_PARTS.map(async (part) => {
      const cachedPart = cachedPartsMap.get(part.mpn);
      if (cachedPart) {
        return await recalculateForecastPart(cachedPart);
      }
      return {
        ...part,
        supplierCount: null,
        totalStock: null,
        lowestPriceUsd: null,
        maxLeadTimeDays: null,
        summary: '尚未查詢',
        riskReasons: [],
      };
    })
  );

  const cacheTTL = 12 * 60 * 60 * 1000; // 12 hours TTL for cached parts

  // Query parts with concurrency (10 parallel workers for faster completion)
  await runWithConcurrency(
    BENCHMARK_PARTS.map((part, idx) => ({ part, idx })),
    10,
    async ({ part, idx }) => {
      const cachedPart = cachedPartsMap.get(part.mpn);
      const isCacheValid =
        cachedPart &&
        cachedPart.queryTime &&
        Date.now() - cachedPart.queryTime < cacheTTL &&
        cachedPart.supplierCount !== null;

      if (isCacheValid) {
        const recalculated = await recalculateForecastPart(cachedPart);
        parts[idx] = recalculated;
        return recalculated;
      }

      // Query live API
      const result = await searchBenchmarkPart(part);
      const resultWithTime = {
        ...result,
        queryTime: Date.now(),
      };

      // Update in-place to preserve index order
      parts[idx] = resultWithTime;

      // Progressive save: save the full 150 parts array containing live results + cached results + empty placeholders
      const currentSummary = buildSupplyCategorySummary(parts);
      await writeCache({
        updatedAt: new Date().toISOString(),
        parts,
        categorySummary: currentSummary,
      });

      return resultWithTime;
    }
  );

  const categorySummary = buildSupplyCategorySummary(parts);
  const updatedAt = new Date().toISOString();

  // Save fully updated cache at the end
  await writeCache({
    updatedAt,
    parts,
    categorySummary,
  });

  return NextResponse.json({
    updatedAt,
    mode,
    news: newsData.news,
    lifecycleNews: newsData.lifecycleNews,
    categorySummary,
    newsCategorySummary: newsData.newsCategorySummary,
    lifecycleCategorySummary: newsData.lifecycleCategorySummary,
    parts,
  });
}
