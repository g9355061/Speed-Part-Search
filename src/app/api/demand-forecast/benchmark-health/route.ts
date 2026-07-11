import { NextResponse } from 'next/server';
import { BENCHMARK_PARTS } from '@/lib/demand-forecast/benchmark';
import { getDemandForecastCache, getDemandForecastSnapshotHistory } from '@/lib/db';

export const dynamic = 'force-dynamic';

// 名單季度體檢：對每顆基準料打「訊號品質」檢查，提出汰換建議（僅報告、不自動改名單）。
// 檢查項：
//   eol        生命週期 EOL/NRND/LTB —— 應挑同 family 現役替代
//   no-data    最近快照為「無資料」或完全沒有快照 —— API 查不到，應換料
//   flat       連續 ≥8 個快照庫存與價格完全不動 —— 死訊號（永遠不會觸發警報），建議換活躍料
//   duplicate  名單內 MPN 重複
export async function GET() {
  const mpns = BENCHMARK_PARTS.map((p) => p.mpn);
  const [cache, history] = await Promise.all([
    getDemandForecastCache(),
    getDemandForecastSnapshotHistory(mpns, 12),
  ]);
  const cachedByMpn = new Map<string, any>(
    (cache?.parts ?? []).map((p: any) => [String(p.mpn).toUpperCase(), p])
  );

  const seen = new Map<string, number>();
  const issues: any[] = [];
  let healthy = 0;

  for (const part of BENCHMARK_PARTS) {
    const key = part.mpn.toUpperCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
    const cached = cachedByMpn.get(key);
    const snaps = history[part.mpn] ?? [];
    const partIssues: string[] = [];

    const lifecycle = String(cached?.lifecycleStatus ?? '');
    if (/obsolete|discontinu|end.of.life|eol|nrnd|not recommended|last time/i.test(lifecycle)) {
      partIssues.push(`eol:${lifecycle}`);
    }
    if (snaps.length === 0) {
      partIssues.push('no-data:從未有快照（新料或查不到）');
    } else {
      const latest = snaps[snaps.length - 1];
      if (latest.riskLevel === '無資料') partIssues.push('no-data:最近快照無代理商資料');
      if (snaps.length >= 8) {
        const recent = snaps.slice(-8);
        const stockFlat = recent.every((s) => s.totalStock === recent[0].totalStock);
        const priceFlat = recent.every((s) => s.price === recent[0].price);
        if (stockFlat && priceFlat) partIssues.push(`flat:連續 ${recent.length} 次快照庫存與價格完全不動`);
      }
    }

    if (partIssues.length > 0) {
      issues.push({
        categoryId: part.categoryId, category: part.category, mpn: part.mpn,
        role: part.role, family: part.family,
        problems: partIssues,
        snapshotCount: snaps.length,
        suggestion: partIssues.some((i) => i.startsWith('eol') || i.startsWith('no-data'))
          ? '建議汰換：挑同 family 現役料，經 /api/search 驗證後替換'
          : '死訊號：建議換同類別更活躍（庫存/價格有波動）的料',
      });
    } else {
      healthy += 1;
    }
  }

  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([m]) => m);

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    totalParts: BENCHMARK_PARTS.length,
    healthy,
    issueCount: issues.length,
    duplicates,
    note: '新料快照需累積 ≥8 週才做 flat 檢查；換料後該顆趨勢訊號會靜默一週（無上週基準），屬預期。',
    issues,
  });
}
