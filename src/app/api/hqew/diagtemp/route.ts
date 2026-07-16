// 臨時診斷端點：查 Railway 目前對外 IP 與華強封鎖狀態，用完即刪。
// 以 x-cron-secret 放行（middleware 後門）。
import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Railway 目前的對外 IP
  let egressIp = 'unknown';
  try {
    const r = await fetch('https://api.ipify.org?format=json', {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    egressIp = ((await r.json()) as { ip?: string }).ip ?? 'unknown';
  } catch (e) {
    egressIp = `error: ${e instanceof Error ? e.message : String(e)}`;
  }

  // ipOnly=1：只回對外 IP，不碰華強（用來取樣 IP 是否浮動，避免再刺激封鎖）
  if (req.nextUrl.searchParams.get('ipOnly') === '1') {
    return NextResponse.json({ egressIp, at: new Date().toISOString() });
  }

  // 華強目前對這個 IP 的回應
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  let hqew: Record<string, unknown> = {};
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
      locale: 'zh-CN',
    });
    const resp = await page.goto('https://s.hqew.com/TXB0104YZTR.html', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    const status = resp?.status() ?? 0;
    const body = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    let rows = 0;
    try {
      await page.waitForSelector('tr.ec-data', { timeout: 15000 });
      rows = await page.locator('tr.ec-data').count();
    } catch {
      rows = 0;
    }
    hqew = {
      status,
      blocked: status === 403 && /请求过于频繁|拦截|解封/.test(body),
      rows,
      bodySnippet: body.slice(0, 120),
    };
  } catch (e) {
    hqew = { error: e instanceof Error ? e.message : String(e) };
  } finally {
    await browser?.close();
  }

  return NextResponse.json({ egressIp, hqew, at: new Date().toISOString() });
}
