import { NextRequest, NextResponse } from 'next/server';
import { getFenghuoView, ingestFenghuoHtml, FENGHUO_SOURCE_URL } from '@/lib/demand-forecast/fenghuo';

export const dynamic = 'force-dynamic';

/** GET：回傳目前快取（含市場指數趨勢、熱料清單、上榜歷史、各類別計數） */
export async function GET() {
  try {
    const view = await getFenghuoView();
    return NextResponse.json(view);
  } catch (err) {
    console.error('[FenghuoAPI] GET failed:', err);
    return NextResponse.json({ available: false, error: err instanceof Error ? err.message : '讀取失敗' }, { status: 500 });
  }
}

/**
 * POST：寫入一次抓取結果。只接受 x-cron-secret（不開放給登入使用者），兩種來源：
 *   1. body {"html": "..."}：GitHub Actions runner 抓好的首頁 HTML（正式流程，Railway 的 IP 不出面）
 *   2. ?fetch=1：由伺服器自己去抓（本機測試用；正式站避免使用，華強封鎖不會解封）
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return NextResponse.json({ error: '需要 x-cron-secret' }, { status: 401 });
  }
  try {
    let html = '';
    if (req.nextUrl.searchParams.get('fetch') === '1') {
      const res = await fetch(FENGHUO_SOURCE_URL, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) return NextResponse.json({ error: `烽火指數回應 HTTP ${res.status}` }, { status: 502 });
      html = await res.text();
    } else {
      const body = await req.json().catch(() => null);
      html = typeof body?.html === 'string' ? body.html : '';
    }
    if (!html || html.length < 1000) {
      return NextResponse.json({ error: '缺少 html（body.html）或內容過短' }, { status: 400 });
    }
    const cache = await ingestFenghuoHtml(html);
    return NextResponse.json({
      ok: true,
      updatedAt: cache.updatedAt,
      marketMonths: cache.market.length,
      hotParts: cache.hotParts.length,
      unclassified: cache.hotParts.filter((p) => !p.categoryId).map((p) => p.mpn),
      snapshots: cache.snapshots.length,
    });
  } catch (err) {
    console.error('[FenghuoAPI] POST failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : '寫入失敗' }, { status: 500 });
  }
}
