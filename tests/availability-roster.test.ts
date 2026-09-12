/**
 * 類別可得性指數（availability.ts）與名單成分審查（roster.ts）。執行：npm test
 */
import assert from 'node:assert/strict';
import { buildCategoryWeeks, evaluateCategoryAvailability } from '../src/lib/demand-forecast/availability';
import { decideDelistings, buildCandidates, vacanciesByCategory, applyRoster, CATEGORY_QUOTA_DEFAULT } from '../src/lib/demand-forecast/roster';

// ---- 造一個類別 15 週的快照：前 12 週穩定，後 2 週交期拉長＋庫存掉一半 ----
const mkHistory = (opts: { tightenLastWeeks?: number; leadOnly?: boolean } = {}) => {
  const history: Record<string, any[]> = {};
  const parts = Array.from({ length: 10 }, (_, i) => ({ mpn: `P${i}`, categoryId: 'C03' }));
  for (const p of parts) {
    history[p.mpn] = [];
    for (let w = 0; w < 15; w++) {
      const d = new Date(Date.UTC(2026, 5, 6 + w * 7)); // 週六
      const tight = opts.tightenLastWeeks ? w >= 15 - opts.tightenLastWeeks : false;
      history[p.mpn].push({
        date: d.toISOString(), supplierCount: 2,
        totalStock: tight && !opts.leadOnly ? 4000 : 10000,
        price: 1, riskLevel: '正常', maxLeadTimeDays: 84,
        minLeadTimeDays: tight ? 140 : 84,   // 12 週 → 20 週
      });
    }
  }
  return { history, parts };
};

{
  const { history, parts } = mkHistory();
  const weeks = buildCategoryWeeks(history, parts);
  assert.equal(weeks.C03.length, 15);
  assert.equal(weeks.C03[0].n, 10);
  assert.equal(weeks.C03[0].inStockRatio, 1);
  assert.equal(weeks.C03[0].leadTimeMedianDays, 84);
  const a = evaluateCategoryAvailability('C03', weeks.C03);
  assert.equal(a.level, 'normal'); assert.equal(a.trend, 'flat'); assert.equal(a.pending, false);
  assert.equal(a.baseline.weeks, 12, '基準取最新兩週以外的 12 週');
}
{
  const { history, parts } = mkHistory({ tightenLastWeeks: 1 });
  const a = evaluateCategoryAvailability('C03', buildCategoryWeeks(history, parts).C03);
  assert.equal(a.level, 'normal', '單週偏離不亮燈'); assert.equal(a.pending, true, '但標待確認');
}
{
  const { history, parts } = mkHistory({ tightenLastWeeks: 2 });
  const a = evaluateCategoryAvailability('C03', buildCategoryWeeks(history, parts).C03);
  assert.equal(a.level, 'high', '交期 +8 週且庫存 −60% 連續兩週＝高'); assert.equal(a.trend, 'tightening'); assert.equal(a.consecutiveTightWeeks, 2);
  assert.ok(a.text.includes('連續 2 週'));
  assert.ok(Math.abs(a.deltas.leadTimeWeeks! - 8) < 0.01);
}
{
  const { history, parts } = mkHistory({ tightenLastWeeks: 2, leadOnly: true });
  const a = evaluateCategoryAvailability('C03', buildCategoryWeeks(history, parts).C03);
  assert.equal(a.level, 'medium', '只有交期拉長（庫存不變）＝中');
}
{
  // 記憶體：同樣訊號最多 medium
  const { history, parts } = mkHistory({ tightenLastWeeks: 2 });
  const p4 = parts.map((p) => ({ ...p, categoryId: 'C04' }));
  const h4 = Object.fromEntries(Object.entries(history));
  const a = evaluateCategoryAvailability('C04', buildCategoryWeeks(h4, p4).C04);
  assert.equal(a.level, 'medium'); assert.equal(a.externalPrimary, true); assert.ok(a.text.includes('樣本料僅供參考'));
}
{
  // 基準不足 6 週 → insufficient
  const { history, parts } = mkHistory();
  for (const k of Object.keys(history)) history[k] = history[k].slice(-5);
  const a = evaluateCategoryAvailability('C03', buildCategoryWeeks(history, parts).C03);
  assert.equal(a.level, 'insufficient');
}

// ---- 除名判定 ----
const snaps = (stocks: Array<number | null>, extra: Partial<any> = {}) => stocks.map((s, i) => ({
  date: `2026-08-${String(i + 1).padStart(2, '0')}`, totalStock: s ?? 0, supplierCount: s == null ? 0 : 2, price: 1, minLeadTimeDays: 84, maxLeadTimeDays: 84, riskLevel: s == null ? '無資料' : '正常', ...extra,
}));
const parts = [
  { categoryId: 'C03', category: 'x', subCategory: 'x', mpn: 'ZERO', manufacturer: '', family: '', role: 'thermometer' as const },
  { categoryId: 'C03', category: 'x', subCategory: 'x', mpn: 'NODATA', manufacturer: '', family: '', role: 'thermometer' as const },
  { categoryId: 'C03', category: 'x', subCategory: 'x', mpn: 'FLAT', manufacturer: '', family: '', role: 'thermometer' as const },
  { categoryId: 'C03', category: 'x', subCategory: 'x', mpn: 'EOL', manufacturer: '', family: '', role: 'thermometer' as const },
  { categoryId: 'C03', category: 'x', subCategory: 'x', mpn: 'OK', manufacturer: '', family: '', role: 'thermometer' as const },
  { categoryId: 'C03', category: 'x', subCategory: 'x', mpn: 'ZERO3', manufacturer: '', family: '', role: 'thermometer' as const },
];
const history = {
  ZERO: snaps([100, 0, 0, 0, 0]),
  NODATA: snaps([100, null, null, null, null]),
  FLAT: snaps([500, 500, 500, 500, 500, 500, 500, 500]),
  EOL: snaps([100, 100]),
  OK: snaps([100, 90, 120, 80, 95, 100, 110, 90]),
  ZERO3: snaps([100, 100, 0, 0, 0]),
};
const cache = [{ mpn: 'EOL', lifecycleStatus: 'Not Recommended for New Designs' }];
const delist = decideDelistings(parts as any, history as any, cache);
const reasons = Object.fromEntries(delist.map((d) => [d.mpn, d.reason.split(':')[0]]));
assert.deepEqual(reasons, { ZERO: 'zero4', NODATA: 'nodata4', FLAT: 'flat8', EOL: 'eol' }, 'OK 與 ZERO3（只 3 週）不得除名');

// ---- 遞補候選與缺額 ----
const roster: any = { version: 1, updatedAt: '', removed: [{ mpn: 'RECENT', categoryId: 'C03', reason: 'zero4', at: new Date().toISOString() }], added: [], log: [] };
const active = applyRoster(parts as any, roster);
const hot: any[] = [
  { mpn: 'IRF740', brand: 'INFINEON', priceCny: 1, categoryId: 'C03', categoryLabel: '', weeksOnList: 3, isNew: false },
  { mpn: 'NE555DR', brand: 'TI', priceCny: 1, categoryId: 'C09', categoryLabel: '', weeksOnList: 5, isNew: false },
  { mpn: 'STM32F103C8T6', brand: 'ST', priceCny: 1, categoryId: 'C05', categoryLabel: '', weeksOnList: 1, isNew: true },
  { mpn: 'RECENT', brand: 'X', priceCny: 1, categoryId: 'C03', categoryLabel: '', weeksOnList: 9, isNew: false },
  { mpn: 'OK', brand: 'X', priceCny: 1, categoryId: 'C03', categoryLabel: '', weeksOnList: 9, isNew: false },
];
const cands = buildCandidates(active, roster, hot, [{ mpn: 'SI2301CDS-T1-GE3', count: 4 }, { mpn: 'BSS138', count: 2 }, { mpn: 'XYZ-UNKNOWN', count: 9 }]);
const candMpns = cands.map((c) => `${c.source}:${c.mpn}`);
assert.deepEqual(candMpns, ['fenghuo:NE555DR', 'fenghuo:IRF740', 'search:SI2301CDS-T1-GE3'],
  '連續 ≥3 週在榜且不在名單／26 週內未被除名者；搜尋 ≥3 次且能歸類者；STM32 只 1 週、RECENT 冷卻中、OK 已在名單、BSS138 只 2 次、XYZ 無法歸類');
const vac = vacanciesByCategory(active);
assert.equal(vac.C03, CATEGORY_QUOTA_DEFAULT - 6);
assert.equal(vac.C01, CATEGORY_QUOTA_DEFAULT);

console.log('availability-roster.test.ts: all assertions passed');
