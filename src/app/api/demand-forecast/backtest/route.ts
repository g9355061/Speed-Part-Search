import { NextResponse } from 'next/server';
import { BENCHMARK_PARTS } from '@/lib/demand-forecast/benchmark';
import { getDemandForecastSnapshotHistory, type SnapshotPoint } from '@/lib/db';
import { getGenericCache, setGenericCache } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * 規則命中率回測
 *
 * 問題意識（2026-09-05 體檢）：系統從未驗證過自己準不準。快照已累積 13 週、2,240 筆，
 * 足以回答「亮燈之後實際發生什麼」。
 *
 * 方法：對每顆料的相鄰快照重跑一次現行規則，找出歷史上的每一次觸發，再看該訊號之後
 * 4 週內是否「回復」。回復＝假警報，未回復＝命中。定義刻意保守且逐條寫明，避免用
 * risk_level 當結果造成循環論證（risk_level 本身就是這些規則算出來的）。
 *
 * 另附 baseRate：未觸發任何訊號的觀測，之後 4 週內庫存跌破一半的比例。命中率必須
 * 明顯高於 baseRate，規則才算有資訊量。
 */

const HORIZON = 4; // 未來 4 週
const CACHE_KEY = 'forecast-backtest-v1';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface RuleStat {
  code: string;
  label: string;
  signals: number;
  hits: number;
  precision: number | null;
  outcome: string;
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET() {
  try {
    const cached: any = await getGenericCache(CACHE_KEY);
    if (cached?.builtAt && Date.now() - cached.builtAt < CACHE_TTL_MS) {
      return NextResponse.json({ ...cached.result, cached: true });
    }
  } catch (err) {
    console.warn('[BACKTEST] cache read failed:', err);
  }

  const mpns = BENCHMARK_PARTS.map((p) => p.mpn);
  const history = await getDemandForecastSnapshotHistory(mpns, 52);

  const stats: Record<string, { signals: number; hits: number }> = {};
  const bump = (code: string, hit: boolean) => {
    if (!stats[code]) stats[code] = { signals: 0, hits: 0 };
    stats[code].signals += 1;
    if (hit) stats[code].hits += 1;
  };

  let baseObservations = 0;
  let baseHalved = 0;
  let evaluatedWeeks = 0;
  const allDates = new Set<string>();

  for (const mpn of mpns) {
    const points = (history[mpn] ?? []) as SnapshotPoint[];
    points.forEach((p) => allDates.add(p.date));
    if (points.length < 3) continue;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      const future = points.slice(i + 1, i + 1 + HORIZON);
      if (future.length === 0) continue; // 未來窗不足，無法評估
      evaluatedWeeks += 1;

      const prevStock = num(prev.totalStock) ?? 0;
      const curStock = num(cur.totalStock) ?? 0;
      const stockRecovered = future.some((f) => (num(f.totalStock) ?? 0) >= prevStock * 0.9);

      const drop = prevStock > 0 ? (prevStock - curStock) / prevStock : 0;
      const anySignal =
        (prevStock > 0 && drop >= 0.5) ||
        (prevStock > 0 && curStock === 0) ||
        (prev.supplierCount >= 2 && cur.supplierCount === 1);

      if (prevStock > 0 && drop >= 0.8) bump('stockDrop80', !stockRecovered);
      else if (prevStock > 0 && drop >= 0.5) bump('stockDrop50', !stockRecovered);

      if (prevStock > 0 && curStock === 0) bump('stockZero', !future.some((f) => (num(f.totalStock) ?? 0) > 0));

      if (prev.supplierCount >= 2 && cur.supplierCount === 1) {
        bump('supplierDrop', !future.some((f) => f.supplierCount >= prev.supplierCount));
      }

      const prevPrice = num(prev.price);
      const curPrice = num(cur.price);
      if (prevPrice && curPrice && prevPrice > 0 && (curPrice - prevPrice) / prevPrice >= 0.3) {
        bump('priceRise30', !future.some((f) => {
          const fp = num(f.price);
          return fp !== null && fp <= prevPrice * 1.1;
        }));
      }

      const prevLead = num(prev.minLeadTimeDays);
      const curLead = num(cur.minLeadTimeDays);
      if (prevLead !== null && curLead !== null && curLead - prevLead >= 56) {
        bump('leadTimeIncrease56', !future.some((f) => {
          const fl = num(f.minLeadTimeDays);
          return fl !== null && fl <= prevLead + 14;
        }));
      }

      // 對照組：本週沒有任何訊號的觀測，未來 4 週內庫存是否跌破一半
      if (!anySignal && curStock > 0) {
        baseObservations += 1;
        if (future.some((f) => (num(f.totalStock) ?? 0) <= curStock * 0.5)) baseHalved += 1;
      }
    }
  }

  const LABELS: Record<string, { label: string; outcome: string }> = {
    stockDrop80: { label: '庫存週減 ≥80%', outcome: '之後 4 週未回到訊號前 9 成水位' },
    stockDrop50: { label: '庫存週減 ≥50%', outcome: '之後 4 週未回到訊號前 9 成水位' },
    stockZero: { label: '庫存歸零', outcome: '之後 4 週仍無庫存' },
    supplierDrop: { label: '授權分銷商剩 1 家', outcome: '之後 4 週未回升' },
    priceRise30: { label: '最低價週漲 ≥30%', outcome: '之後 4 週未跌回訊號前 1.1 倍以內' },
    leadTimeIncrease56: { label: '最短交期拉長 ≥8 週', outcome: '之後 4 週未縮回訊號前 +2 週以內' },
  };

  const rules: RuleStat[] = Object.keys(LABELS).map((code) => {
    const s = stats[code] ?? { signals: 0, hits: 0 };
    return {
      code,
      label: LABELS[code].label,
      outcome: LABELS[code].outcome,
      signals: s.signals,
      hits: s.hits,
      precision: s.signals > 0 ? Math.round((s.hits / s.signals) * 1000) / 10 : null,
    };
  }).sort((a, b) => b.signals - a.signals);

  const result = {
    generatedAt: new Date().toISOString(),
    horizonWeeks: HORIZON,
    snapshotWeeks: allDates.size,
    evaluatedObservations: evaluatedWeeks,
    partsCovered: mpns.filter((m) => (history[m] ?? []).length >= 3).length,
    rules,
    baseRate: {
      label: '對照組：本週無任何訊號',
      observations: baseObservations,
      halvedWithin4Weeks: baseHalved,
      rate: baseObservations > 0 ? Math.round((baseHalved / baseObservations) * 1000) / 10 : null,
      outcome: '之後 4 週內庫存曾跌破一半',
    },
    note: `以現行規則重跑歷史快照。命中＝訊號發生後 ${HORIZON} 週內未回復；最後 ${HORIZON} 週的訊號因未來窗不足未納入統計。`,
    cached: false,
  };

  try {
    await setGenericCache(CACHE_KEY, { builtAt: Date.now(), result });
  } catch (err) {
    console.warn('[BACKTEST] cache write failed:', err);
  }

  return NextResponse.json(result);
}
