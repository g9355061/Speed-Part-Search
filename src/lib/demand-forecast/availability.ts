import type { SnapshotPoint } from '@/lib/db';
import { BENCHMARK_PARTS, DEMAND_CATEGORIES } from './benchmark';

/**
 * 類別可得性指數（2026-09-13）
 *
 * 取樣追蹤的目的是「看類別有沒有缺料」，不是數幾顆料亮燈。實測 13 週快照：MLCC 有貨比例
 * 8/8→6/11、交期 20→24 週、庫存中位數 −98%，比 8/30 三星電機漲價新聞早兩個月；MOSFET 交期
 * 8→16 週。這些趨勢以前從沒被算出來——看板逐顆判定再數紅燈，MLCC 的紅燈其實是 4 顆死料撐的。
 *
 * 做法：每類三條線，跟自己的歷史比，連續兩週偏離才亮燈。
 *   1. 有貨比例   inStockRatio     = 該類別有貨料數 / 有代理商資料的料數
 *   2. 交期中位數 leadTimeMedian   = 各料最短交期的中位數（天）
 *   3. 庫存中位數 stockMedian      = 各料庫存的中位數
 * 基準 = 最新兩週以外、往前最多 12 週的中位數（最新週不能汙染自己的基準）。
 * 交期是主訊號（回測 95% 命中），權重 2；其餘各 1。單週偏離只標「待確認」，連續 ≥2 週才算。
 *
 * 記憶體（C04）例外：DRAM 缺料反映在合約價與現貨市場，DigiKey 的模組庫存不會動（實測 13 週
 * 有貨比例反而上升、交期 36 週不動）。此類以外部訊號為主，樣本指數最多只給「中」。
 */

export const AVAILABILITY_BASELINE_WEEKS = 12;
export const AVAILABILITY_MIN_BASELINE_WEEKS = 6;
export const AVAILABILITY_CONFIRM_WEEKS = 2;

/** 樣本料不適合當主判定的類別（以外部訊號為主） */
export const EXTERNAL_PRIMARY_CATEGORIES = new Set(['C04']);

export interface AvailabilityWeek {
  week: string;              // 週一日期 YYYY-MM-DD（台北）
  date: string;              // 該週實際採用的快照日期
  n: number;                 // 有代理商資料的料數
  inStockRatio: number | null;
  leadTimeMedianDays: number | null;
  stockMedian: number | null;
  tightScore: number;        // 0–4：有貨 1 ＋ 交期 2 ＋ 庫存 1（對基準）
  looseScore: number;        // 0–2：庫存回補 1 ＋ 交期縮短 1
}

export type AvailabilityLevel = 'high' | 'medium' | 'normal' | 'insufficient';
export type AvailabilityTrend = 'tightening' | 'loosening' | 'flat';

export interface CategoryAvailability {
  categoryId: string;
  externalPrimary: boolean;
  level: AvailabilityLevel;
  trend: AvailabilityTrend;
  /** 最新一週是否偏離但尚未連續兩週（單週待確認） */
  pending: boolean;
  consecutiveTightWeeks: number;
  weeks: AvailabilityWeek[];           // 由舊到新，最多 16 週
  latest: AvailabilityWeek | null;
  baseline: { weeks: number; inStockRatio: number | null; leadTimeMedianDays: number | null; stockMedian: number | null };
  deltas: { inStockRatio: number | null; leadTimeWeeks: number | null; stockPct: number | null }; // 最新 vs 基準
  text: string;
}

export interface AvailabilityIndex {
  computedAt: string;
  categories: Record<string, CategoryAvailability>;
}

const TAIPEI_OFFSET_MS = 8 * 3600 * 1000;

function weekStartTaipei(value: string): string {
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return '';
  const shifted = new Date(t + TAIPEI_OFFSET_MS);
  const day = shifted.getUTCDay();
  shifted.setUTCDate(shifted.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return shifted.toISOString().slice(0, 10);
}

function median(values: number[]): number | null {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (s.length === 0) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * 把逐料的快照重組成「每類別、每週」的三條線。
 * 同一週有多筆快照（6/1、6/3、6/6）取最晚的一筆；只算有代理商資料（supplierCount > 0）的料。
 */
export function buildCategoryWeeks(
  history: Record<string, SnapshotPoint[]>,
  parts: Array<{ mpn: string; categoryId: string }> = BENCHMARK_PARTS,
  maxWeeks = 16
): Record<string, AvailabilityWeek[]> {
  const catOf = new Map(parts.map((p) => [p.mpn.toUpperCase(), p.categoryId]));
  // categoryId → week → mpn → 該週最晚快照
  const grid = new Map<string, Map<string, Map<string, SnapshotPoint>>>();
  for (const [mpn, points] of Object.entries(history)) {
    const categoryId = catOf.get(mpn.toUpperCase());
    if (!categoryId) continue;
    for (const p of points ?? []) {
      if (!(Number(p.supplierCount) > 0)) continue;
      const week = weekStartTaipei(p.date);
      if (!week) continue;
      const byWeek = grid.get(categoryId) ?? new Map();
      grid.set(categoryId, byWeek);
      const byMpn = byWeek.get(week) ?? new Map();
      byWeek.set(week, byMpn);
      const prev = byMpn.get(mpn);
      if (!prev || Date.parse(p.date) > Date.parse(prev.date)) byMpn.set(mpn, p);
    }
  }
  const out: Record<string, AvailabilityWeek[]> = {};
  for (const cat of DEMAND_CATEGORIES) {
    const byWeek = grid.get(cat.categoryId);
    if (!byWeek) { out[cat.categoryId] = []; continue; }
    const weeks = [...byWeek.keys()].sort().slice(-maxWeeks);
    out[cat.categoryId] = weeks.map((week) => {
      const pts = [...byWeek.get(week)!.values()];
      const n = pts.length;
      const stocks = pts.map((p) => Number(p.totalStock)).filter((v) => Number.isFinite(v));
      const leads = pts.map((p) => p.minLeadTimeDays).filter((v): v is number => v != null && Number.isFinite(Number(v))).map(Number);
      return {
        week,
        date: pts.map((p) => String(p.date)).sort().slice(-1)[0] ?? week,
        n,
        inStockRatio: n ? stocks.filter((s) => s > 0).length / n : null,
        leadTimeMedianDays: median(leads),
        stockMedian: median(stocks),
        tightScore: 0,
        looseScore: 0,
      };
    });
  }
  return out;
}

function scoreWeek(w: AvailabilityWeek, base: CategoryAvailability['baseline']) {
  let tight = 0;
  let loose = 0;
  if (w.inStockRatio != null && base.inStockRatio != null && w.inStockRatio <= base.inStockRatio - 0.15) tight += 1;
  // 庫存與有貨都在回補時，交期單獨拉長不足以判轉緊（首輪實測 MLCC 庫存 +140% 卻因交期 +4 週亮燈）
  const stockImproving = w.stockMedian != null && base.stockMedian != null && base.stockMedian > 0
    && w.stockMedian >= base.stockMedian * 1.25 && (w.inStockRatio ?? 1) >= (base.inStockRatio ?? 0) - 0.05;
  if (w.leadTimeMedianDays != null && base.leadTimeMedianDays != null) {
    if (w.leadTimeMedianDays >= base.leadTimeMedianDays * 1.2 && w.leadTimeMedianDays - base.leadTimeMedianDays >= 14) tight += stockImproving ? 1 : 2;
    if (w.leadTimeMedianDays <= base.leadTimeMedianDays * 0.8 && base.leadTimeMedianDays - w.leadTimeMedianDays >= 14) loose += 1;
  }
  if (w.stockMedian != null && base.stockMedian != null && base.stockMedian > 0) {
    if (w.stockMedian <= base.stockMedian * 0.6) tight += 1;
    if (w.stockMedian >= base.stockMedian * 1.5 && (w.inStockRatio ?? 1) >= (base.inStockRatio ?? 0) - 0.05) loose += 1;
  }
  return { tight, loose };
}

const WEEK_TIGHT = 2; // 單週要算「偏離」的最低分：交期一項即達標，或有貨＋庫存兩項

export function evaluateCategoryAvailability(categoryId: string, weeksIn: AvailabilityWeek[]): CategoryAvailability {
  const externalPrimary = EXTERNAL_PRIMARY_CATEGORIES.has(categoryId);
  const weeks = weeksIn.map((w) => ({ ...w }));
  const latest = weeks[weeks.length - 1] ?? null;
  const baseWeeks = weeks.slice(0, Math.max(0, weeks.length - AVAILABILITY_CONFIRM_WEEKS)).slice(-AVAILABILITY_BASELINE_WEEKS);
  const baseline = {
    weeks: baseWeeks.length,
    inStockRatio: median(baseWeeks.map((w) => w.inStockRatio).filter((v): v is number => v != null)),
    leadTimeMedianDays: median(baseWeeks.map((w) => w.leadTimeMedianDays).filter((v): v is number => v != null)),
    stockMedian: median(baseWeeks.map((w) => w.stockMedian).filter((v): v is number => v != null)),
  };
  const empty: CategoryAvailability = {
    categoryId, externalPrimary, level: 'insufficient', trend: 'flat', pending: false, consecutiveTightWeeks: 0,
    weeks, latest, baseline, deltas: { inStockRatio: null, leadTimeWeeks: null, stockPct: null },
    text: `樣本快照不足 ${AVAILABILITY_MIN_BASELINE_WEEKS} 週，尚無法判定類別趨勢。`,
  };
  if (!latest || baseWeeks.length < AVAILABILITY_MIN_BASELINE_WEEKS) return empty;

  for (const w of weeks) {
    const s = scoreWeek(w, baseline);
    w.tightScore = s.tight;
    w.looseScore = s.loose;
  }
  let consecutive = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].tightScore >= WEEK_TIGHT) consecutive++;
    else break;
  }
  const latestTight = latest.tightScore >= WEEK_TIGHT;
  const confirmed = consecutive >= AVAILABILITY_CONFIRM_WEEKS;
  const prevLoose = weeks[weeks.length - 2]?.looseScore ?? 0;
  const loosening = !latestTight && latest.looseScore >= 1 && prevLoose >= 1;

  let level: AvailabilityLevel = 'normal';
  if (confirmed) level = latest.tightScore >= 3 ? 'high' : 'medium';
  if (externalPrimary && level === 'high') level = 'medium';
  const trend: AvailabilityTrend = confirmed ? 'tightening' : loosening ? 'loosening' : 'flat';
  const pending = latestTight && !confirmed;

  const deltas = {
    inStockRatio: latest.inStockRatio != null && baseline.inStockRatio != null ? latest.inStockRatio - baseline.inStockRatio : null,
    leadTimeWeeks: latest.leadTimeMedianDays != null && baseline.leadTimeMedianDays != null ? (latest.leadTimeMedianDays - baseline.leadTimeMedianDays) / 7 : null,
    stockPct: latest.stockMedian != null && baseline.stockMedian != null && baseline.stockMedian > 0 ? (latest.stockMedian / baseline.stockMedian - 1) * 100 : null,
  };

  const parts: string[] = [];
  if (deltas.leadTimeWeeks != null && Math.abs(deltas.leadTimeWeeks) >= 2) parts.push(`交期中位數${deltas.leadTimeWeeks > 0 ? '拉長' : '縮短'} ${Math.abs(deltas.leadTimeWeeks).toFixed(0)} 週`);
  if (deltas.inStockRatio != null && Math.abs(deltas.inStockRatio) >= 0.15) parts.push(`有貨比例${deltas.inStockRatio < 0 ? '下降' : '回升'}`);
  if (deltas.stockPct != null && (deltas.stockPct <= -40 || deltas.stockPct >= 50)) parts.push(`庫存中位數較基準${deltas.stockPct < 0 ? '減' : '增'} ${Math.abs(deltas.stockPct).toFixed(0)}%`);
  let text: string;
  if (confirmed) text = `連續 ${consecutive} 週偏離自身基準：${parts.join('、')}。`;
  else if (pending) text = `本週偏離基準（${parts.join('、')}），尚未連續兩週，待下週確認。`;
  else if (loosening) text = `供應轉鬆：${parts.join('、') || '庫存回補'}。`;
  else text = '有貨比例、交期與庫存均在自身 12 週基準範圍內。';
  if (externalPrimary) text += ' 此類別以新聞、市場報告與現貨指數為主判定，樣本料僅供參考。';

  return { categoryId, externalPrimary, level, trend, pending, consecutiveTightWeeks: consecutive, weeks, latest, baseline, deltas, text };
}

export function computeAvailabilityIndex(
  history: Record<string, SnapshotPoint[]>,
  parts: Array<{ mpn: string; categoryId: string }> = BENCHMARK_PARTS,
  now = new Date()
): AvailabilityIndex {
  const weeksByCat = buildCategoryWeeks(history, parts);
  const categories: Record<string, CategoryAvailability> = {};
  for (const cat of DEMAND_CATEGORIES) {
    categories[cat.categoryId] = evaluateCategoryAvailability(cat.categoryId, weeksByCat[cat.categoryId] ?? []);
  }
  return { computedAt: now.toISOString(), categories };
}
