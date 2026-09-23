import { NextRequest, NextResponse } from 'next/server';
import { getQuoteSuppliers } from '@/lib/suppliers/registry';
import { PartResult, SupplierError } from '@/lib/suppliers/types';
import { logPartSearch } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SupplierBlock {
  supplier: string;
  results: PartResult[];
  error?: { code: string; message: string };
}

function requestedSupplierNames(req: NextRequest): Set<string> | null {
  const raw = req.nextUrl.searchParams.get('suppliers')?.trim();
  if (!raw) return null;
  const names = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return names.length ? new Set(names) : null;
}

export async function GET(req: NextRequest) {
  const partNumber = req.nextUrl.searchParams.get('partNumber')?.trim();
  if (!partNumber) {
    return NextResponse.json(
      { error: 'partNumber query parameter is required' },
      { status: 400 }
    );
  }

  // 記錄實際被查詢的料號（實戰料 field parts 的資料來源），不等待、失敗不影響搜尋
  void logPartSearch(partNumber, 'search');

  const requested = requestedSupplierNames(req);
  // 這個入口是給人看價格的，所以含 Mouser CN（人民幣）；呼叫端都會明列 suppliers
  const suppliers = requested
    ? getQuoteSuppliers().filter((s) => requested.has(s.name.toLowerCase()))
    : getQuoteSuppliers();

  if (requested && suppliers.length === 0) {
    return NextResponse.json(
      { error: `No enabled suppliers matched "${Array.from(requested).join(',')}"` },
      { status: 400 }
    );
  }

  const blocks: SupplierBlock[] = await Promise.all(
    suppliers.map(async (s): Promise<SupplierBlock> => {
      try {
        // 人在看價格的入口才雙幣別查詢；缺料預測與名單查驗維持單幣別
        const results = await s.search({ partNumber, includeAltCurrency: true });
        return { supplier: s.name, results };
      } catch (e) {
        if (e instanceof SupplierError) {
          return {
            supplier: s.name,
            results: [],
            error: { code: e.code, message: e.message },
          };
        }
        return {
          supplier: s.name,
          results: [],
          error: {
            code: 'UNKNOWN',
            message: e instanceof Error ? e.message : String(e),
          },
        };
      }
    })
  );

  return NextResponse.json({ partNumber, suppliers: blocks });
}
