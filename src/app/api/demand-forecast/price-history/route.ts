import { NextRequest, NextResponse } from 'next/server';
import { getDemandForecastPriceHistory } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/demand-forecast/price-history?mpns=A,B,C
 * 回傳每顆料件的歷史最低價曲線資料點（依日期升冪），供前端繪製 sparkline。
 * 資料來源為 demand_forecast_snapshots 快照表（每日一點，Phase II 每週自動查詢累積）。
 */
export async function GET(req: NextRequest) {
  const mpnsParam = req.nextUrl.searchParams.get('mpns') ?? '';
  const mpns = mpnsParam
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

  if (mpns.length === 0) {
    return NextResponse.json({ history: {} });
  }

  const history = await getDemandForecastPriceHistory(mpns);
  return NextResponse.json({ history });
}
