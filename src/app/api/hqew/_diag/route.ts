// 臨時診斷端點：確認 Railway 機房 IP 從華強電子網拿到什麼頁面。
// 以 x-cron-secret 放行（middleware 後門），診斷完畢後移除。
import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const partNumber = req.nextUrl.searchParams.get('partNumber')?.trim() || 'TXB0104YZTR';
  const url = `https://s.hqew.com/${encodeURIComponent(partNumber)}.html`;
  const startedAt = Date.now();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const launchedMs = Date.now() - startedAt;
    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
      locale: 'zh-CN',
    });

    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const gotoMs = Date.now() - startedAt;
    await page.waitForTimeout(2500);

    const probe = await page.evaluate(() => ({
      title: document.title,
      ecData: document.querySelectorAll('tr.ec-data').length,
      anyTr: document.querySelectorAll('tr').length,
      tables: document.querySelectorAll('table').length,
      htmlLength: document.documentElement.outerHTML.length,
    }));
    const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');

    return NextResponse.json({
      ok: true,
      url,
      httpStatus: resp?.status() ?? null,
      finalUrl: page.url(),
      launchedMs,
      gotoMs,
      totalMs: Date.now() - startedAt,
      probe,
      bodyTextSnippet: bodyText.slice(0, 800),
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        url,
        totalMs: Date.now() - startedAt,
        error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      },
      { status: 502 },
    );
  } finally {
    await browser?.close();
  }
}
