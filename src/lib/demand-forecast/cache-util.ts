import fs from 'fs';
import path from 'path';
import { CATEGORY_THRESHOLDS, DEMAND_CATEGORIES } from './benchmark';
import { getDemandForecastCache, setDemandForecastCache, getDemandForecastSnapshot7DaysAgo, getGenericCache, setGenericCache } from '@/lib/db';

const CACHE_DIR = path.join(process.cwd(), 'data');
const CACHE_PATH = path.join(CACHE_DIR, 'demand-forecast-cache.json');
const NEWS_CACHE_KEY = 'news-cache-v1';
const NEWS_CACHE_PATH = path.join(CACHE_DIR, 'news-cache.json');

// 新聞快取以 DB 為準——Railway 磁碟是暫時性的，部署後 data/ 下的檔案會消失；
// 本機舊檔僅作首次遷移的讀取 fallback。
export async function readNewsCacheShared(): Promise<any | null> {
  try {
    const dbCache = await getGenericCache(NEWS_CACHE_KEY);
    if (dbCache) return dbCache;
  } catch (err) {
    console.error('[NEWS_CACHE] Failed to read database cache:', err);
  }
  try {
    if (!fs.existsSync(NEWS_CACHE_PATH)) return null;
    return JSON.parse(fs.readFileSync(NEWS_CACHE_PATH, 'utf-8'));
  } catch (err) {
    console.error('[NEWS_CACHE] Failed to read legacy cache file:', err);
    return null;
  }
}

export async function writeNewsCacheShared(data: any): Promise<void> {
  try {
    await setGenericCache(NEWS_CACHE_KEY, data);
  } catch (err) {
    console.error('[NEWS_CACHE] Failed to write database cache:', err);
  }
}

// 依供應商 API 的 lifecycleStatus 判定生命週期風險等級（權威、零雜訊，取代 RSS PCN/EOL 新聞）
export function lifecycleFlag(status?: string | null): 'high' | 'medium' | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (/obsolete|discontinued|end.of.life|eol|last.time.buy|\bltb\b|not for new/.test(s)) return 'high';
  if (/nrnd|not recommended/.test(s)) return 'medium';
  return null;
}

export async function readCache(): Promise<{ updatedAt: string; parts: any[]; categorySummary: any[] } | null> {
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

export async function writeCache(data: { updatedAt: string; parts: any[]; categorySummary: any[] }) {
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

export function buildSupplyCategorySummary(parts: any[]) {
  return DEMAND_CATEGORIES.map((cat) => {
    const items = parts.filter((part) => part.categoryId === cat.categoryId);
    const highRiskParts = items.filter((part) => part.riskLevel === '高風險');
    const medRiskParts = items.filter((part) => part.riskLevel === '中風險');
    const riskParts = items.filter((part) => part.riskLevel === '高風險' || part.riskLevel === '中風險');
    const checkedParts = items.filter((part) => part.supplierCount > 0);
    const totalStock = items.reduce((sum, part) => sum + (part.totalStock || 0), 0);
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
      summary: categoryHighRisk ? ('有缺料風險' as const) : categoryMedRisk ? ('中風險' as const) : ('正常' as const),
    };
  });
}

export async function recalculateForecastPart(part: any, customThresholds?: Record<string, { minStock: number; lowStock: number }>) {
  if (part.summary === '尚未查詢' || part.supplierCount === null || part.supplierCount === undefined) {
    return part;
  }

  const hasApiMatch = part.supplierCount > 0;
  const totalStock = part.totalStock ?? 0;
  const minLeadTimeDays = part.minLeadTimeDays ?? null;
  const lowestPriceUsd = part.lowestPriceUsd ?? null;

  // --- Lifecycle status detection from cached data ---
  const lcStatus = (part.lifecycleStatus || part.availabilityStatus || '').toLowerCase().trim();
  const isObsolete = lcStatus.includes('obsolete') || lcStatus.includes('discontinued') || lcStatus === 'end of life' || lcStatus === 'eol';
  const isLastTimeBuy = lcStatus.includes('last time buy') || lcStatus.includes('ltb');
  const isNRND = lcStatus.includes('nrnd') || lcStatus.includes('not recommended');
  const lifecycleLabel = part.lifecycleStatus || null;

  const thresholds = (customThresholds && customThresholds[part.categoryId]) || CATEGORY_THRESHOLDS[part.categoryId] || { minStock: 1000, lowStock: 5000 };
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

  const highRisk = noStockAfterMatch || isObsolete || isLastTimeBuy || (totalStock < thresholds.lowStock && veryLongLead) || !!(snapshot7DaysAgo && stockDrop80);
  const mediumRisk = !highRisk && (
    isNRND ||
    (totalStock < thresholds.minStock) ||
    (totalStock < thresholds.lowStock && mediumLead) ||
    !!(snapshot7DaysAgo && (stockDrop50 || supplierDrop || priceRise30 || leadTimeIncrease56))
  );

  const riskLevel: '高風險' | '中風險' | '正常' | '無資料' = !hasApiMatch ? '無資料' : highRisk ? '高風險' : mediumRisk ? '中風險' : '正常';
  const summary = highRisk ? '有缺料風險' : mediumRisk ? '中風險' : (hasApiMatch ? '正常' : '無代理商資料');

  const riskReasons = [
    !hasApiMatch ? 'API 未找到此料，無授權代理商通路資料' : '',
    isObsolete ? `🔴 生命週期：原廠已標示停產 (${lifecycleLabel})，庫存售完即止` : '',
    isLastTimeBuy ? `🔴 生命週期：原廠已進入最後採購期 (${lifecycleLabel})` : '',
    isNRND ? `🟡 生命週期：原廠不建議新設計採用 (${lifecycleLabel})` : '',
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

export async function recalculatePartsCache(partsCache: any, customThresholds?: Record<string, { minStock: number; lowStock: number }>) {
  if (!partsCache || !Array.isArray(partsCache.parts)) return partsCache;

  let changed = false;
  const recalculatedParts = await Promise.all(
    partsCache.parts.map(async (part: any) => {
      const updated = await recalculateForecastPart(part, customThresholds);
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
