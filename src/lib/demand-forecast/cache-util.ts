import fs from 'fs';
import path from 'path';
import { DEMAND_CATEGORIES } from './benchmark';
import { evaluatePartRisk, computeBaseline, pickPreviousSnapshot, type RiskEvalContext, type RiskThresholds } from './risk';
import { getDemandForecastCache, setDemandForecastCache, getDemandForecastSnapshot7DaysAgo, getDemandForecastSnapshotHistory, getGenericCache, setGenericCache } from '@/lib/db';

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

export async function recalculateForecastPart(
  part: any,
  customThresholds?: Record<string, RiskThresholds>,
  ctx?: { prev?: any | null; baseline?: ReturnType<typeof computeBaseline> }
) {
  if (part.summary === '尚未查詢' || part.supplierCount === null || part.supplierCount === undefined) {
    return part;
  }

  // ctx 由呼叫端一次備妥（整批查一次歷史）；沒給才回退為單顆查詢，
  // 否則 mode=cached 每次載入會對 150 顆各打一次 DB。
  let prev = ctx?.prev ?? null;
  if (!ctx) {
    try {
      prev = await getDemandForecastSnapshot7DaysAgo(part.mpn);
    } catch (err) {
      console.error(`[RECALC] Failed to load snapshot for ${part.mpn}:`, err);
    }
  }

  const evaluated = evaluatePartRisk(
    {
      categoryId: part.categoryId,
      hasApiMatch: part.supplierCount > 0,
      totalStock: part.totalStock ?? 0,
      supplierCount: part.supplierCount ?? 0,
      minLeadTimeDays: part.minLeadTimeDays ?? null,
      lowestPriceUsd: part.lowestPriceUsd ?? null,
      lifecycleStatus: part.lifecycleStatus,
      availabilityStatus: part.availabilityStatus,
    },
    { thresholds: customThresholds, prev, baseline: ctx?.baseline ?? null }
  );

  return {
    ...part,
    riskLevel: evaluated.riskLevel,
    summary: evaluated.summary,
    riskReasons: evaluated.riskReasons,
    alertKind: evaluated.alertKind,
    eventCodes: evaluated.eventCodes,
  };
}

/** 一次備妥全部料件的「上次快照 + 自身歷史基準」，避免逐顆查 DB */
export async function buildRiskContexts(mpns: string[]) {
  const contexts = new Map<string, { prev: any | null; baseline: ReturnType<typeof computeBaseline> }>();
  if (mpns.length === 0) return contexts;
  try {
    const history = await getDemandForecastSnapshotHistory(mpns);
    const now = new Date();
    for (const mpn of mpns) {
      const points = history[mpn];
      contexts.set(mpn, { prev: pickPreviousSnapshot(points, now), baseline: computeBaseline(points, now) });
    }
  } catch (err) {
    console.error('[RECALC] Failed to load snapshot history:', err);
  }
  return contexts;
}

export async function recalculatePartsCache(partsCache: any, customThresholds?: Record<string, RiskThresholds>) {
  if (!partsCache || !Array.isArray(partsCache.parts)) return partsCache;

  const contexts = await buildRiskContexts(
    partsCache.parts.map((part: any) => part.mpn).filter(Boolean)
  );

  let changed = false;
  const recalculatedParts = await Promise.all(
    partsCache.parts.map(async (part: any) => {
      const ctx = contexts.get(part.mpn) ?? { prev: null, baseline: null };
      const updated = await recalculateForecastPart(part, customThresholds, ctx);
      if (
        part.riskLevel !== updated.riskLevel ||
        part.summary !== updated.summary ||
        part.alertKind !== updated.alertKind ||
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
