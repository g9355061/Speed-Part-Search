import { CATEGORY_THRESHOLDS } from './benchmark';
import type { SnapshotPoint } from '@/lib/db';

/**
 * 缺料風險判定（單一事實來源）
 *
 * 2026-09-05 重構：原本 route.ts 的 summarizePart 與 cache-util.ts 的 recalculateForecastPart
 * 各有一份規則副本，且已經漂移（supplierDrop 門檻一邊 >=2、一邊 >=3），同一顆料在
 * mode=full 與 mode=cached 會得到不同結論。兩者現在都走這裡。
 *
 * 同時導入兩項改動（依 2026-09-05 資料體檢結論）：
 *   1. 相對水位：固定顆數門檻對庫存中位數以上的料形同虛設（實測庫存跨 7 個數量級，
 *      中位數 12,803、最大 5,157 萬，而門檻是 1,000／5,000）。改為同時看「相對自身
 *      歷史 P20」，讓大宗料也能在自身低檔時亮燈。
 *   2. 狀態／事件分流：實測近 6 週亮高風險的 38 顆裡有 18 顆是「6 週全紅」的結構性
 *      料（EOL/NRND/庫存長期為 0）。這些不是本週新聞，標為 structural；真正的本週
 *      變化標為 event，讓看板能把兩者分開陳列。
 */

export interface RiskThresholds {
  minStock: number;
  lowStock: number;
}

/** 單顆料的自身歷史基準（用於相對水位判定） */
export interface PartBaseline {
  p20: number;
  p40: number;
  weeks: number;
}

export type AlertKind = 'event' | 'structural' | null;

export interface RiskEvalInput {
  categoryId: string;
  hasApiMatch: boolean;
  totalStock: number;
  supplierCount: number;
  minLeadTimeDays: number | null;
  lowestPriceUsd: number | null;
  lifecycleStatus?: string | null;
  availabilityStatus?: string | null;
}

export interface RiskEvalContext {
  thresholds?: Record<string, RiskThresholds>;
  prev?: any | null;          // 上一次快照（4–10 天前），無則不做趨勢比對
  baseline?: PartBaseline | null;
}

export interface RiskEvalResult {
  riskLevel: '高風險' | '中風險' | '正常' | '無資料';
  summary: string;
  riskReasons: string[];
  alertKind: AlertKind;
  /** 本週觸發的趨勢事件代碼，供回測與看板使用 */
  eventCodes: string[];
}

/** 相對水位至少需要幾週歷史才啟用（低於此則只用絕對門檻，行為同舊版） */
export const BASELINE_MIN_WEEKS = 6;

/** 相對低水位需低於自身 P20 的比例（0.9＝再低 10%，濾掉貼著門檻的抖動） */
export const RELATIVE_LOW_MARGIN = 0.9;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
  return sorted[idx];
}

/**
 * 由歷史快照算出單顆料的自身庫存分位數。
 * 排除 4 天內的點，避免把「本週剛寫入的值」算進自己的基準。
 */
export function computeBaseline(points: SnapshotPoint[] | undefined, now = new Date()): PartBaseline | null {
  if (!points || points.length === 0) return null;
  const cutoff = now.getTime() - 4 * 86400000;
  const stocks = points
    .filter((p) => {
      const t = Date.parse(p.date);
      return !Number.isFinite(t) || t <= cutoff;
    })
    .map((p) => Number(p.totalStock))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  if (stocks.length === 0) return null;
  return { p20: percentile(stocks, 0.2), p40: percentile(stocks, 0.4), weeks: stocks.length };
}

/** 挑出「上一次快照」：4–10 天前的最近一點（與舊版 getDemandForecastSnapshot7DaysAgo 同窗口） */
export function pickPreviousSnapshot(points: SnapshotPoint[] | undefined, now = new Date()) {
  if (!points || points.length === 0) return null;
  const max = now.getTime() - 4 * 86400000;
  const min = now.getTime() - 10 * 86400000;
  const inWindow = points.filter((p) => {
    const t = Date.parse(p.date);
    return Number.isFinite(t) && t >= min && t <= max;
  });
  const chosen = inWindow[inWindow.length - 1];
  if (!chosen) return null;
  return {
    totalStock: chosen.totalStock,
    supplierCount: chosen.supplierCount,
    lowestPriceUsd: chosen.price,
    minLeadTimeDays: chosen.minLeadTimeDays,
    riskLevel: chosen.riskLevel,
  };
}

const RISK_ORDER: Record<string, number> = { '無資料': 0, '正常': 1, '中風險': 2, '高風險': 3 };

export function evaluatePartRisk(input: RiskEvalInput, ctx: RiskEvalContext = {}): RiskEvalResult {
  const { thresholds: customThresholds, prev, baseline } = ctx;
  const hasApiMatch = input.hasApiMatch;
  const totalStock = input.totalStock ?? 0;
  const minLeadTimeDays = input.minLeadTimeDays ?? null;
  const lowestPriceUsd = input.lowestPriceUsd ?? null;

  const lcStatus = String(input.lifecycleStatus || input.availabilityStatus || '').toLowerCase().trim();
  const isObsolete = lcStatus.includes('obsolete') || lcStatus.includes('discontinued') || lcStatus === 'end of life' || lcStatus === 'eol';
  const isLastTimeBuy = lcStatus.includes('last time buy') || lcStatus.includes('ltb');
  const isNRND = lcStatus.includes('nrnd') || lcStatus.includes('not recommended');
  const lifecycleLabel = input.lifecycleStatus || null;

  const thresholds = (customThresholds && customThresholds[input.categoryId])
    || CATEGORY_THRESHOLDS[input.categoryId]
    || { minStock: 1000, lowStock: 5000 };

  const noStockAfterMatch = hasApiMatch && totalStock <= 0;
  const veryLongLead = minLeadTimeDays !== null && minLeadTimeDays >= 140; // >= 20 週
  const mediumLead = minLeadTimeDays !== null && minLeadTimeDays >= 84;    // >= 12 週

  // --- 相對水位：低於自身歷史 P20／P40（需要足夠週數才啟用）---
  // 需比自身 P20 再低 10% 才算數：P20 定義上本來就有兩成時間會被跌破，
  // 貼著門檻的抖動（如 12,803 vs P20 12,823）不該亮燈。
  const baselineReady = !!baseline && baseline.weeks >= BASELINE_MIN_WEEKS && baseline.p20 > 0;
  const relLow = baselineReady && totalStock < baseline!.p20 * RELATIVE_LOW_MARGIN;
  const relSoft = baselineReady && !relLow && totalStock < baseline!.p40;

  // --- 趨勢事件（對比上一次快照）---
  const stockDrop50 = !!prev && prev.totalStock > 0 && ((prev.totalStock - totalStock) / prev.totalStock) >= 0.5;
  const stockDrop80 = !!prev && prev.totalStock > 0 && ((prev.totalStock - totalStock) / prev.totalStock) >= 0.8;
  // 供應商最多 2 家（DigiKey + Mouser，HK/VN 已併入 Mouser），故門檻為 >=2 降至 1
  const supplierDrop = !!prev && prev.supplierCount >= 2 && input.supplierCount === 1;
  const priceRise30 = !!prev && prev.lowestPriceUsd != null && lowestPriceUsd != null && lowestPriceUsd > 0
    && ((lowestPriceUsd - prev.lowestPriceUsd) / prev.lowestPriceUsd) >= 0.3;
  const leadTimeIncrease56 = !!prev && prev.minLeadTimeDays != null && minLeadTimeDays != null
    && (minLeadTimeDays - prev.minLeadTimeDays) >= 56;

  // 相對水位只參與「中風險」層：高風險仍以絕對低庫存為準。
  // 若讓 relLow 進入高風險條件，實測會把 29 顆高風險一次推到 37 顆——
  // 改善的目標是讓看不見的訊號浮現，不是製造更多紅燈。
  const absLowWater = totalStock < thresholds.lowStock;
  const lowWater = absLowWater || relLow;

  const highRisk = noStockAfterMatch
    || isObsolete
    || isLastTimeBuy
    || (absLowWater && veryLongLead)
    || stockDrop80;
  const mediumRisk = !highRisk && (
    isNRND
    || totalStock < thresholds.minStock
    || relLow
    || (lowWater && mediumLead)
    || stockDrop50
    || supplierDrop
    || priceRise30
    || leadTimeIncrease56
  );

  const riskLevel: RiskEvalResult['riskLevel'] = !hasApiMatch ? '無資料' : highRisk ? '高風險' : mediumRisk ? '中風險' : '正常';
  const summary = highRisk ? '有缺料風險' : mediumRisk ? '中風險' : (hasApiMatch ? '正常' : '無代理商資料');

  const relText = baselineReady ? `（近 ${baseline!.weeks} 週 P20＝${Math.round(baseline!.p20).toLocaleString()}）` : '';
  const riskReasons = [
    !hasApiMatch ? 'API 未找到此料，無授權代理商通路資料' : '',
    isObsolete ? `🔴 生命週期：原廠已標示停產 (${lifecycleLabel})，庫存售完即止` : '',
    isLastTimeBuy ? `🔴 生命週期：原廠已進入最後採購期 (${lifecycleLabel})` : '',
    isNRND ? `🟡 生命週期：原廠不建議新設計採用 (${lifecycleLabel})` : '',
    noStockAfterMatch ? '🔴 API 找到料件但授權供應商庫存為 0' : '',
    (absLowWater && veryLongLead) ? `🔴 庫存不足 ${thresholds.lowStock.toLocaleString()} 且補貨最短交期達 ${Math.round(minLeadTimeDays! / 7)} 週（超過 20 週）` : '',
    stockDrop80 ? `🔴 趨勢警告：庫存較上次快照暴跌超過 80%（自 ${Number(prev.totalStock).toLocaleString()} 降至 ${totalStock.toLocaleString()}）` : '',
    (lowWater && mediumLead && !veryLongLead) ? `🟡 庫存處於低水位且補貨最短交期達 ${Math.round(minLeadTimeDays! / 7)} 週` : '',
    (relLow && totalStock > 0) ? `🟡 庫存 ${totalStock.toLocaleString()} 顆，低於自身歷史低水位${relText}` : '',
    (totalStock < thresholds.minStock && totalStock > 0 && !veryLongLead && !mediumLead && !relLow)
      ? `🟡 庫存僅 ${totalStock.toLocaleString()} 顆（低於安全水位 ${thresholds.minStock.toLocaleString()}）` : '',
    (stockDrop50 && !stockDrop80) ? `🟡 趨勢警告：庫存較上次快照下降超過 50%（自 ${Number(prev.totalStock).toLocaleString()} 降至 ${totalStock.toLocaleString()}）` : '',
    supplierDrop ? `🟡 趨勢警告：可用授權分銷商數量自 ${prev.supplierCount} 家減至 1 家` : '',
    priceRise30 ? `🟡 趨勢警告：最低報價較上次快照上漲超過 30%（自 $${Number(prev.lowestPriceUsd).toFixed(4)} 漲至 $${lowestPriceUsd!.toFixed(4)}）` : '',
    leadTimeIncrease56 ? `🟡 趨勢警告：補貨最短交期較上次快照拉長 ${Math.round((minLeadTimeDays! - prev.minLeadTimeDays) / 7)} 週` : '',
    relSoft ? `ℹ️ 庫存低於自身歷史中位水位，尚未達預警` : '',
  ].filter(Boolean);

  // --- 狀態／事件分流 ---
  const eventCodes = [
    stockDrop80 ? 'stockDrop80' : '',
    stockDrop50 && !stockDrop80 ? 'stockDrop50' : '',
    supplierDrop ? 'supplierDrop' : '',
    priceRise30 ? 'priceRise30' : '',
    leadTimeIncrease56 ? 'leadTimeIncrease56' : '',
  ].filter(Boolean);

  const escalated = !!prev && prev.riskLevel && (RISK_ORDER[riskLevel] ?? 0) > (RISK_ORDER[prev.riskLevel] ?? 0);
  const alertKind: AlertKind =
    riskLevel === '正常' || riskLevel === '無資料'
      ? null
      : (eventCodes.length > 0 || escalated)
        ? 'event'
        : 'structural';

  return { riskLevel, summary, riskReasons, alertKind, eventCodes };
}
