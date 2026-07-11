import { NextResponse } from 'next/server';
import { BENCHMARK_PARTS } from '@/lib/demand-forecast/benchmark';
import { getTopSearchedMpns } from '@/lib/db';

export const dynamic = 'force-dynamic';

// 實戰料（field）輪換建議：最近 90 天最常被實際搜尋的料號。
// 已在 benchmark 內的會標示；不在名單內且搜尋次數高的，就是下一批實戰料候選。
// candidate 正式進名單前仍須經 /api/search 驗證「查得到 + Active + 有庫存」。
export async function GET() {
  const top = await getTopSearchedMpns(90, 30);
  const benchmarkMpns = new Set(BENCHMARK_PARTS.map((p) => p.mpn.toUpperCase()));
  const currentFieldParts = BENCHMARK_PARTS.filter((p) => p.role === 'field').map((p) => ({
    categoryId: p.categoryId, category: p.category, mpn: p.mpn, family: p.family,
  }));

  const suggestions = top.map((t) => ({
    ...t,
    inBenchmark: benchmarkMpns.has(t.mpn),
  }));
  const candidates = suggestions.filter((s) => !s.inBenchmark);

  return NextResponse.json({
    windowDays: 90,
    totalLogged: top.reduce((s, t) => s + t.count, 0),
    note: top.length === 0
      ? '尚無搜尋記錄。search_logs 會累積 /api/search 與 QQ 詢價的實際查詢，建議累積 4 週後再輪換實戰料。'
      : '候選料進名單前，須先以 /api/search 驗證「查得到 + Active + 有庫存」。',
    currentFieldParts,
    topSearched: suggestions,
    candidates,
  });
}
