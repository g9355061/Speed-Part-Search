/**
 * 死料降級（risk.ts）與週報摘要（weekly-digest.ts）。執行：npm test
 */
import assert from 'node:assert/strict';
import { computeZeroStreak, evaluatePartRisk, DEAD_ZERO_STREAK } from '../src/lib/demand-forecast/risk';
import { buildWeeklyDigest } from '../src/lib/demand-forecast/weekly-digest';

// ---- computeZeroStreak：從最新一筆往回數 ----
const pts = (stocks: number[]) => stocks.map((s, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, totalStock: s, supplierCount: 2, price: 1, minLeadTimeDays: 84, maxLeadTimeDays: 84, riskLevel: '正常' })) as any;
assert.equal(computeZeroStreak(pts([100, 0, 0, 0])), 3);
assert.equal(computeZeroStreak(pts([0, 0, 50, 0])), 1);
assert.equal(computeZeroStreak(pts([10, 20])), 0);
assert.equal(computeZeroStreak(undefined), 0);

// ---- 死料：連續零庫存 → 代理商未備貨，不再是高風險 ----
const base = { categoryId: 'C01', hasApiMatch: true, totalStock: 0, supplierCount: 2, minLeadTimeDays: 84, lowestPriceUsd: 0.01 };
const fresh = evaluatePartRisk(base, { zeroStreak: 0 });
assert.equal(fresh.riskLevel, '高風險', '第一次歸零仍是高風險（真的缺料）');
const borderline = evaluatePartRisk(base, { zeroStreak: DEAD_ZERO_STREAK - 1 });
assert.equal(borderline.riskLevel, '高風險', `含本次共 ${DEAD_ZERO_STREAK} 次仍算缺料`);
const dead = evaluatePartRisk(base, { zeroStreak: DEAD_ZERO_STREAK });
assert.equal(dead.riskLevel, '無資料');
assert.equal(dead.summary, '代理商未備貨');
assert.equal(dead.alertKind, null);
assert.ok(dead.riskReasons[0].includes(`連續 ${DEAD_ZERO_STREAK + 1} 次`));
const stocked = evaluatePartRisk({ ...base, totalStock: 5000 }, { zeroStreak: 10 });
assert.notEqual(stocked.summary, '代理商未備貨', '有庫存就不適用死料規則');

// ---- 週報摘要 ----
const report: any = {
  id: 'weekly-2026-09-14', title: '物料預測週報｜2026/09/14｜DRAM 交期拉長，AI 需求推升漲價潮', href: '/demand-forecast/weekly-reports/weekly-2026-09-14',
  date: '2026/09/14', riskLevel: 'high', summary: '本期導言。',
  executiveItems: [
    { category: '記憶體 / Flash / DDR', headline: 'HBM 短缺蔓延', story: ['第一段 <b>內容</b>。', '第二段。'], suggestedMove: '鎖價並提前 8 週下單', watchpoint: '', evidence: [] },
  ],
  lifecycleOngoing: [{ mpn: 'MP1584EN-LF-Z', manufacturer: 'MPS', category: 'PMIC', status: 'NRND', sinceDate: '2026/07/20' }],
  spotMarket: { updatedAt: null, sourceUrl: 'https://fh.hqew.com/', hasPrevious: false, hotParts: [], trend: { month: '2026/08', search: null, stock: null, price: null, tone: 'flat', text: '華強烽火指數 2026 年 08 月：大盤平穩。' } },
};
const digest = buildWeeklyDigest(report, 'https://example.com/');
assert.equal(digest.subject, '【物料預測週報】2026/09/14｜DRAM 交期拉長，AI 需求推升漲價潮');
assert.ok(digest.text.includes('1. [記憶體 / Flash / DDR] HBM 短缺蔓延'));
assert.ok(digest.text.includes('→ 行動：鎖價並提前 8 週下單'));
assert.ok(digest.text.includes('MP1584EN-LF-Z NRND（自 2026/07/20）'));
assert.ok(digest.text.includes('https://example.com/demand-forecast/weekly-reports/weekly-2026-09-14'), '連結不得出現雙斜線');
assert.ok(digest.html.includes('&lt;b&gt;內容&lt;/b&gt;'), 'HTML 要跳脫');
assert.ok(digest.html.includes('華強烽火指數 2026 年 08 月'));

console.log('risk-digest.test.ts: all assertions passed');
