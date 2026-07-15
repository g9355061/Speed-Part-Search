// 臨時診斷端點：以修正後的判斷邏輯確認 Railway 上被 403 封鎖時會正確回報錯誤。
// 以 x-cron-secret 放行（middleware 後門），驗證完畢後移除。
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
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
      locale: 'zh-CN',
    });

    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const status = resp?.status() ?? 0;
    if (status >= 400) {
      const blockText = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
      if (status === 403 && /请求过于频繁|拦截|解封/.test(blockText)) {
        throw new Error('華強電子網暫時封鎖了本站 IP（請求過於頻繁），請稍後再試');
      }
      throw new Error(`華強電子網回應 HTTP ${status}`);
    }

    let rowsAppeared = true;
    try {
      await page.waitForSelector('tr.ec-data', { timeout: 20000 });
    } catch {
      rowsAppeared = false;
    }

    const bodyText = await page.locator('body').innerText({ timeout: 5000 });
    const totalCount = Number(bodyText.match(/共\s*([0-9]+)\s*条/)?.[1] ?? 0);

    if (!rowsAppeared && totalCount !== 0 && !/无结果|無結果/.test(bodyText)) {
      throw new Error('華強電子網未回傳供應商列表（可能被防爬阻擋或頁面改版），請稍後再試');
    }

    const supplierCount = await page.locator('tr.ec-data').count();
    return NextResponse.json({ ok: true, httpStatus: status, totalCount, rowsAppeared, supplierCount });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  } finally {
    await browser?.close();
  }
}
