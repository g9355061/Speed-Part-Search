import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { chromium } from 'playwright';
import { authOptions } from '@/lib/auth-config';
import { canAccessQqInquiry } from '@/lib/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface HqewSupplier {
  supplier: string;
  mpn: string;
  manufacturer: string;
  batch: string;
  stock: number;
  packageText: string;
  location: string;
  note: string;
  date: string;
  qq?: string;
  qqHref?: string;
  jumpUrl?: string | null;
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36';

// 取得騰訊企點簽章跳轉連結（tencent://QQInterLive?...&kfuin=...&uid=...）。
// gateway getWpaUrl 直接以 server fetch 呼叫會回 10001 parameter error（需瀏覽器指紋與
// 前端 JS 產生的 client 狀態），所以用 Playwright 渲染官方 wpa 頁、攔截它自己發出的
// getWpaUrl 回應。簽章 uid 實測可重複使用且存活至少 40 分鐘，搜尋階段預抓即可。
async function fetchQqJumpUrl(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  qq: string,
): Promise<string | null> {
  // 快路徑：v1/b2b/qq/wpa 可直接 server fetch。部分企點號在這層就拿到
  // wpa1.qq.com/<碼>?qidian=true 簽章短連結（官方頁對這種號也是直接轉走、
  // 不會再呼叫 getWpaUrl），直接回傳給前端 window.open 即可。
  try {
    const res = await fetch(`https://gateway.qidian.qq.com/v1/b2b/qq/wpa?uin=${qq}&_=${Date.now()}`, {
      headers: { 'User-Agent': BROWSER_UA, Referer: 'https://wpa.qq.com/' },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    const data = (await res.json()) as { code?: number; data?: { direct_jump_url?: string } | null };
    const direct = data.code === 0 ? data.data?.direct_jump_url ?? '' : '';
    if (/qidian=true|wpa1\.qq\.com/i.test(direct)) return direct;
  } catch {
    // 快路徑失敗就走 Playwright
  }

  const page = await browser.newPage({ userAgent: BROWSER_UA, locale: 'zh-CN' });
  try {
    const respPromise = page.waitForResponse((r) => r.url().includes('/v1/b2b/wpa/getWpaUrl'), { timeout: 12000 });
    await page.goto(`https://wpa.qq.com/msgrd?v=3&uin=${qq}&exe=qq&site=hqew&menu=no`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    const resp = await respPromise;
    const data = (await resp.json()) as { code?: number; data?: { url?: string } | null };
    const jumpUrl = data.code === 0 && data.data?.url?.startsWith('tencent://') ? data.data.url : null;
    return jumpUrl;
  } catch {
    return null;
  } finally {
    await page.close().catch(() => undefined);
  }
}

function cleanSupplierName(text: string) {
  return text
    .replace(/\d+\s*条/g, '')
    .replace(/评价/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseStock(text: string) {
  const n = Number(text.replace(/,/g, '').replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!canAccessQqInquiry(session?.user)) {
    return NextResponse.json({ error: '無權限' }, { status: 403 });
  }

  const partNumber = req.nextUrl.searchParams.get('partNumber')?.trim();
  if (!partNumber) {
    return NextResponse.json({ error: 'partNumber query parameter is required' }, { status: 400 });
  }

  const url = `https://s.hqew.com/${encodeURIComponent(partNumber)}.html`;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
      locale: 'zh-CN',
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('tr.ec-data, body', { timeout: 12000 });
    await page.waitForTimeout(2500);

    const bodyText = await page.locator('body').innerText({ timeout: 5000 });
    const totalCount = Number(bodyText.match(/共\s*([0-9]+)\s*条/)?.[1] ?? 0);

    const suppliers = await page.locator('tr.ec-data').evaluateAll((rows) =>
      rows.slice(0, 3).map((row) => {
        const cell = (selector: string) =>
          (row.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
        const cells = Array.from(row.querySelectorAll('td')).map((td) =>
          (td.textContent ?? '').replace(/\s+/g, ' ').trim()
        );
        return {
          supplier: cell('.j-company-td') || cells[1] || '',
          mpn: cell('.td-model') || cells[3] || '',
          manufacturer: cell('.td-brand') || cells[4] || '',
          batch: cell('.td-pproductDate') || cells[5] || '',
          stockText: cell('.td-stockNum') || cells[6] || '',
          packageText: cell('.td-ppackage') || cells[7] || '',
          location: cell('.td-storeLocation') || cells[8] || '',
          note: cell('.td-premark') || cells[9] || '',
          date: cells[10] || '',
          qq: row.querySelector('a.a-qq, a[qq]')?.getAttribute('qq') || '',
          qqHref: (() => {
            const anchors = Array.from(row.querySelectorAll<HTMLAnchorElement>('a.a-qq, a[qq], a[href*="wpa"], a[href*="qq"], a[href*="qidian"]'))
              .filter((item) => {
                const href = item.getAttribute('href') || '';
                const className = item.className || '';
                const raw = item.getAttribute('data') || '';
                return !/weixin|wechat/i.test(`${href} ${className} ${raw}`);
              });
            const a = anchors.find((item) => {
              const raw = item.getAttribute('data') || '';
              const href = item.getAttribute('href') || '';
              return /qqHref|wpa|qq|qidian/i.test(`${raw} ${href}`);
            });
            if (!a) return '';
            const raw = a.getAttribute('data') || '';
            let href = '';
            try {
              href = raw ? JSON.parse(raw).qqHref || '' : '';
            } catch {
              href = '';
            }
            // featured 供應商的企點連結直接掛在 href（無 data JSON），補抓
            const directHref = a.getAttribute('href') || '';
            return href || (directHref && !/^javascript:/i.test(directHref) ? directHref : '');
          })(),
        };
      })
    );

    const normalized: HqewSupplier[] = suppliers.map((s) => ({
      supplier: cleanSupplierName(s.supplier),
      mpn: s.mpn,
      manufacturer: s.manufacturer,
      batch: s.batch,
      stock: parseStock(s.stockText),
      packageText: s.packageText,
      location: s.location,
      note: s.note,
      date: s.date,
      qq: s.qq,
      qqHref: s.qqHref,
    })).filter((s) => s.supplier && s.mpn);

    // 預抓每家的簽章跳轉連結（華強已給企點連結者不需要）；三家並行
    const activeBrowser = browser;
    await Promise.all(
      normalized.map(async (s) => {
        if (!s.qq || /qidian=true|wpa1\.qq\.com/i.test(s.qqHref ?? '')) return;
        s.jumpUrl = await fetchQqJumpUrl(activeBrowser, s.qq.replace(/\D/g, ''));
      }),
    );

    return NextResponse.json({
      partNumber,
      url,
      totalCount,
      suppliers: normalized,
      queriedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      {
        partNumber,
        url,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 502 }
    );
  } finally {
    await browser?.close();
  }
}
