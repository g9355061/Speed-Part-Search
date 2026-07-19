import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { chromium } from 'playwright';
import { authOptions } from '@/lib/auth-config';
import { canAccessQqInquiry } from '@/lib/permissions';
import { logPartSearch, getGenericCache, setGenericCache } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 華強查詢結果快取（料號 × 3 小時，存 DB）：同料號重複查詢不再重打華強，
// 直接降低觸發封鎖的頻率（實測連打 6 次即被封 IP，且封鎖不會自動解除）。
// 只快取華強的供應商列表；企點簽章跳轉連結（jumpUrl 實測僅存活約 40 分鐘）
// 在快取命中時重新預抓——那些請求打的是騰訊 gateway，不會碰華強。
const HQEW_CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const HQEW_CACHE_PREFIX = 'hqew-search-';

type LaunchedBrowser = Awaited<ReturnType<typeof chromium.launch>>;

// 模組層級共用 browser：先前每個 request chromium.launch 再 close，28 顆 BOM 就是
// 28 次瀏覽器冷啟（每次 1–2 秒＋記憶體峰值）。頁面各自建立與關閉，互不影響。
// 存在 globalThis 以撐過 Next dev 熱重載，避免重複 launch 洩漏。
const hqewGlobal = globalThis as unknown as { __hqewBrowserPromise?: Promise<LaunchedBrowser> | null };

async function getSharedBrowser(): Promise<LaunchedBrowser> {
  if (hqewGlobal.__hqewBrowserPromise) {
    try {
      const existing = await hqewGlobal.__hqewBrowserPromise;
      if (existing.isConnected()) return existing;
    } catch {
      // 前次 launch 失敗，往下重新啟動
    }
  }
  hqewGlobal.__hqewBrowserPromise = chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    return await hqewGlobal.__hqewBrowserPromise;
  } catch (err) {
    hqewGlobal.__hqewBrowserPromise = null;
    throw err;
  }
}

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
async function fetchQqJumpUrl(qq: string): Promise<string | null> {
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

  const browser = await getSharedBrowser();
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

// 為每家供應商預抓企點簽章跳轉連結（華強已給企點連結者不需要）；快取命中與新查詢共用
async function refreshJumpUrls(suppliers: HqewSupplier[]): Promise<void> {
  await Promise.all(
    suppliers.map(async (s) => {
      if (!s.qq || /qidian=true|wpa1\.qq\.com/i.test(s.qqHref ?? '')) return;
      s.jumpUrl = await fetchQqJumpUrl(s.qq.replace(/\D/g, ''));
    }),
  );
}

interface HqewCachedResult {
  partNumber: string;
  url: string;
  totalCount: number;
  suppliers: HqewSupplier[];
  queriedAt: string;
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

  // QQ 詢價查的是真實 BOM 料號——實戰料最有價值的來源（快取命中也照記，記的是查詢意圖）
  void logPartSearch(partNumber, 'qq-inquiry');

  const url = `https://s.hqew.com/${encodeURIComponent(partNumber)}.html`;
  const cacheKey = `${HQEW_CACHE_PREFIX}${partNumber.toUpperCase()}`;
  const force = req.nextUrl.searchParams.get('force') === '1';

  // 快取命中：不碰華強，只重新預抓企點跳轉連結（jumpUrl 簽章壽命短）
  if (!force) {
    try {
      const cached = (await getGenericCache(cacheKey)) as HqewCachedResult | null;
      if (cached?.queriedAt && Date.now() - Date.parse(cached.queriedAt) < HQEW_CACHE_TTL_MS) {
        const suppliers = (cached.suppliers ?? []).map((s) => ({ ...s }));
        await refreshJumpUrls(suppliers);
        return NextResponse.json({ ...cached, suppliers, cached: true });
      }
    } catch (err) {
      console.warn('[HQEW] cache read failed, falling back to live query:', err);
    }
  }

  let page: Awaited<ReturnType<LaunchedBrowser['newPage']>> | null = null;

  try {
    const browser = await getSharedBrowser();
    page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
      locale: 'zh-CN',
    });

    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 華強對機房 IP 會回 403 空白頁「您的请求过于频繁，已被网站管理员设置拦截」。
    // page.goto 不會因 4xx 拋錯，不自己判斷就會被當成「查詢成功但沒有供應商」。
    const status = resp?.status() ?? 0;
    if (status >= 400) {
      const blockText = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
      if (status === 403 && /请求过于频繁|拦截|解封/.test(blockText)) {
        throw new Error('華強電子網暫時封鎖了本站 IP（請求過於頻繁），請稍後再試');
      }
      throw new Error(`華強電子網回應 HTTP ${status}`);
    }

    // 供應商列表是 JS 後續注入的，實測快網路也要 3 秒以上才出現。
    // 原本等的是 'tr.ec-data, body'——body 一定立刻命中，等於完全沒等。
    let rowsAppeared = true;
    try {
      await page.waitForSelector('tr.ec-data', { timeout: 20000 });
    } catch {
      rowsAppeared = false;
    }

    const bodyText = await page.locator('body').innerText({ timeout: 5000 });
    const totalCount = Number(bodyText.match(/共\s*([0-9]+)\s*条/)?.[1] ?? 0);

    // 查無此料號時華強頁面照常渲染、顯示「共 0 条」，那是合法的空結果；
    // 列表沒出現又不是查無，代表被擋或頁面改版，不能回空陣列假裝成功。
    if (!rowsAppeared && totalCount !== 0 && !/无结果|無結果/.test(bodyText)) {
      throw new Error('華強電子網未回傳供應商列表（可能被防爬阻擋或頁面改版），請稍後再試');
    }

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
    await refreshJumpUrls(normalized);

    const result: HqewCachedResult = {
      partNumber,
      url,
      totalCount,
      suppliers: normalized,
      queriedAt: new Date().toISOString(),
    };

    // 只快取成功結果（被擋/查詢失敗不會走到這裡）；jumpUrl 一併存入無妨，命中時會重抓
    try {
      await setGenericCache(cacheKey, result);
    } catch (err) {
      console.warn('[HQEW] cache write failed:', err);
    }

    return NextResponse.json(result);
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
    await page?.close().catch(() => undefined);
  }
}
