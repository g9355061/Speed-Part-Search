import { NextRequest, NextResponse } from 'next/server';
import { getDemandForecastSnapshotHistory, getGenericCache, setGenericCache } from '@/lib/db';
import { getActiveBenchmarkParts } from '@/lib/demand-forecast/roster';
import { computeAvailabilityIndex } from '@/lib/demand-forecast/availability';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'forecast-availability-v1';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** 類別可得性指數：每類三條線（有貨比例、交期中位數、庫存中位數）對自身 12 週基準；6 小時快取 */
export async function GET(req: NextRequest) {
  const fresh = req.nextUrl.searchParams.get('fresh') === '1';
  try {
    if (!fresh) {
      const cached: any = await getGenericCache(CACHE_KEY);
      if (cached?.computedAt && Date.now() - Date.parse(cached.computedAt) < CACHE_TTL_MS) return NextResponse.json(cached);
    }
    const parts = await getActiveBenchmarkParts();
    const history = await getDemandForecastSnapshotHistory(parts.map((p) => p.mpn), 30);
    const index = computeAvailabilityIndex(history, parts);
    await setGenericCache(CACHE_KEY, index).catch(() => undefined);
    return NextResponse.json(index);
  } catch (err) {
    console.error('[Availability] failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : '計算失敗' }, { status: 500 });
  }
}
