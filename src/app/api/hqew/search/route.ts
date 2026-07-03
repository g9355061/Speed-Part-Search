import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { chromium } from 'playwright';
import { authOptions } from '@/lib/auth-config';

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
  if (session?.user?.role !== 'admin') {
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
          qq: row.querySelector('a.a-qq')?.getAttribute('qq') || '',
          qqHref: (() => {
            const raw = row.querySelector('a.a-qq')?.getAttribute('data') || '';
            try {
              return raw ? JSON.parse(raw).qqHref || '' : '';
            } catch {
              return '';
            }
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
