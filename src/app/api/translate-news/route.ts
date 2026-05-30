import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const resolvedCache = new Map<string, { expiresAt: number; url: string }>();
const CACHE_TTL_MS = 60 * 60 * 1000;
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,zh-TW;q=0.8',
};

function googleTranslateUrl(url: string) {
  return `https://translate.google.com/translate?sl=auto&tl=zh-TW&u=${encodeURIComponent(url)}`;
}

function articleIdFromGoogleNewsUrl(url: string): string | null {
  const match = url.match(/news\.google\.com\/(?:rss\/)?articles\/([^?/#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function unescapeGoogleBatchUrl(value: string) {
  return value
    .replace(/\\u003d/g, '=')
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"');
}

async function resolveGoogleNewsUrl(url: string): Promise<string> {
  const cached = resolvedCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  if (cached) resolvedCache.delete(url);

  const articleId = articleIdFromGoogleNewsUrl(url);
  if (!articleId) return url;

  const articleUrl = `https://news.google.com/articles/${articleId}?hl=en-US&gl=US&ceid=US:en`;
  const articleResp = await fetch(articleUrl, {
    headers: BROWSER_HEADERS,
    cache: 'no-store',
  });
  if (!articleResp.ok) return articleUrl;

  const html = await articleResp.text();
  const signature = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const timestamp = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
  if (!signature || !timestamp) return url;

  const payload = [
    [
      [
        'Fbv4je',
        JSON.stringify([
          'garturlreq',
          [
            ['en-US', 'US', ['FINANCE_TOP_INDICES', 'WEB_TEST_1_0_0'], null, null, 1, 1, 'US:en', null, 180, null, null, null, null, null, 0, null, null, [1608992183, 723341000]],
            'en-US',
            'US',
            1,
            [2, 3, 4, 8],
            1,
            0,
            '655000234',
            0,
            0,
            null,
            0,
          ],
          articleId,
          Number(timestamp),
          signature,
        ]),
        null,
        'generic',
      ],
    ],
  ];

  const body = new URLSearchParams({ 'f.req': JSON.stringify(payload) });
  const decodeResp = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      ...BROWSER_HEADERS,
      Referer: articleUrl,
    },
    body,
    cache: 'no-store',
  });
  if (!decodeResp.ok) return articleUrl;

  const text = await decodeResp.text();
  const encodedUrl = text.match(/\["garturlres","(https?:\\\/\\\/[^"]+)"/)?.[1];
  const resolvedUrl = encodedUrl ? unescapeGoogleBatchUrl(encodedUrl) : articleUrl;
  resolvedCache.set(url, { expiresAt: Date.now() + CACHE_TTL_MS, url: resolvedUrl });
  return resolvedUrl;
}

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get('url');
  if (!rawUrl) return NextResponse.redirect(googleTranslateUrl('https://news.google.com'));

  let url = rawUrl;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname === 'news.google.com') {
      url = await resolveGoogleNewsUrl(rawUrl);
    }
  } catch {
    url = rawUrl;
  }

  return NextResponse.redirect(googleTranslateUrl(url));
}
