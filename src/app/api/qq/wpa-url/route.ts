import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 代理騰訊企點 getWpaUrl：對已開通臨時會話的企點客服號，回傳官方簽章的
// tencent://QQInterLive 深層連結（QQ 會放行直達該供應商對話）；
// 未開通（code 459003）則回 jumpUrl: null，前端提示手動加好友。
// 簽章帶一次性 uid，必須在點擊當下即時取得，不能在搜尋階段預抓快取。
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: '無權限' }, { status: 403 });
  }

  const uin = req.nextUrl.searchParams.get('uin')?.replace(/\D/g, '');
  if (!uin) {
    return NextResponse.json({ error: 'uin query parameter is required' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://gateway.qidian.qq.com/v1/b2b/wpa/getWpaUrl?terminal=1&uin=${uin}&_t=${Date.now()}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
          Referer: 'https://admin.qidian.qq.com/',
        },
        signal: AbortSignal.timeout(6000),
        cache: 'no-store',
      },
    );
    const data = (await res.json()) as { code?: number; message?: string; data?: { url?: string } | null };
    const jumpUrl = data.code === 0 && data.data?.url?.startsWith('tencent://') ? data.data.url : null;
    return NextResponse.json({ uin, jumpUrl, reason: jumpUrl ? null : data.message ?? `code ${data.code}` });
  } catch (e) {
    return NextResponse.json({ uin, jumpUrl: null, reason: e instanceof Error ? e.message : String(e) });
  }
}
