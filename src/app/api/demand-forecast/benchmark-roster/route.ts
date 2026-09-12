import { NextRequest, NextResponse } from 'next/server';
import { getDemandForecastSnapshotHistory, getTopSearchedMpns } from '@/lib/db';
import { readCache } from '@/lib/demand-forecast/cache-util';
import { getFenghuoView } from '@/lib/demand-forecast/fenghuo';
import { getEnabledSuppliers } from '@/lib/suppliers/registry';
import { SupplierError, type PartResult } from '@/lib/suppliers/types';
import { getActiveBenchmarkParts, readRoster, rebalanceRoster, vacanciesByCategory, type ValidationResult } from '@/lib/demand-forecast/roster';

export const dynamic = 'force-dynamic';

/** GET：現行名單、覆蓋層（除名／遞補紀錄）、各類別缺額 */
export async function GET() {
  const [roster, active] = await Promise.all([readRoster(), getActiveBenchmarkParts()]);
  return NextResponse.json({
    total: active.length,
    vacancies: vacanciesByCategory(active),
    removed: roster.removed,
    added: roster.added,
    log: roster.log.slice(-50),
    updatedAt: roster.updatedAt || null,
    parts: active,
  });
}

// 候選查驗：DigiKey / Mouser 查得到、Active、有庫存（Mouser 對 TI 鎖庫存，故任一家有貨即可）
async function validateCandidate(mpn: string): Promise<ValidationResult> {
  const results: PartResult[] = [];
  const errors: string[] = [];
  await Promise.all(getEnabledSuppliers().map(async (supplier) => {
    try {
      results.push(...(await supplier.search({ partNumber: mpn })));
    } catch (err) {
      errors.push(err instanceof SupplierError ? `${err.supplier}: ${err.code}` : `${supplier.name}: ERROR`);
    }
  }));
  const exact = results.filter((r) => r.manufacturerPartNumber.toUpperCase().replace(/[\s\-_.\/]/g, '') === mpn.toUpperCase().replace(/[\s\-_.\/]/g, ''));
  const pool = exact.length > 0 ? exact : results;
  if (pool.length === 0) return { ok: false, reason: `代理商查無此料${errors.length ? `（${errors.join('；')}）` : ''}` };
  const eol = pool.every((r) => /obsolete|discontinu|end.of.life|\beol\b|nrnd|not recommended|last time/i.test(`${r.lifecycleStatus ?? ''} ${r.availabilityStatus ?? ''}`));
  if (eol) return { ok: false, reason: `生命週期異常：${pool[0].lifecycleStatus ?? pool[0].availabilityStatus}` };
  const stocked = pool.filter((r) => (r.quantityAvailable ?? 0) > 0);
  if (stocked.length === 0) return { ok: false, reason: '代理商查得到但無庫存' };
  const best = [...stocked].sort((a, b) => b.quantityAvailable - a.quantityAvailable)[0];
  return { ok: true, manufacturer: best.manufacturer, description: best.description };
}

/**
 * POST：跑一次成分審查（除名 → 遞補），只認 x-cron-secret。?dry=1 只算不寫。
 * 由 weekly-forecast workflow 在 mode=full 之前呼叫，讓新名單當週就有第一筆快照。
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return NextResponse.json({ error: '需要 x-cron-secret' }, { status: 401 });
  }
  const dryRun = req.nextUrl.searchParams.get('dry') === '1';
  try {
    const active = await getActiveBenchmarkParts();
    const [history, partsCache, fenghuo, topSearched] = await Promise.all([
      getDemandForecastSnapshotHistory(active.map((p) => p.mpn), 12),
      readCache(),
      getFenghuoView().catch(() => null),
      getTopSearchedMpns(90, 40).catch(() => []),
    ]);
    const report = await rebalanceRoster({
      history,
      partsCache: partsCache?.parts ?? null,
      hotParts: fenghuo?.hotParts ?? [],
      topSearched,
      validate: validateCandidate,
      dryRun,
    });
    return NextResponse.json({ dryRun, ...report });
  } catch (err) {
    console.error('[Roster] rebalance failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : '成分審查失敗' }, { status: 500 });
  }
}
