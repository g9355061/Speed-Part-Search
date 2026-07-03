import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];
const PUBLIC_API_PREFIXES = ['/api/auth/'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Allow public pages and auth API routes
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) return NextResponse.next();
  if (PUBLIC_API_PREFIXES.some(p => pathname.startsWith(p))) return NextResponse.next();

  // 排程器後門：帶正確 CRON_SECRET header 的請求放行（供每週自動查詢用，無 session）
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && pathname.startsWith('/api/') && req.headers.get('x-cron-secret') === cronSecret) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const exp = token.sessionExpiresAt as number | undefined;
  if (exp && Date.now() / 1000 > exp) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    const res = NextResponse.redirect(loginUrl);
    res.cookies.delete('next-auth.session-token');
    res.cookies.delete('__Secure-next-auth.session-token');
    return res;
  }

  // Admin-only routes
  if (pathname.startsWith('/admin/') && token.role !== 'admin') {
    return NextResponse.redirect(new URL('/', req.url));
  }
  if (pathname.startsWith('/qq-inquiry') && token.role !== 'admin') {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
