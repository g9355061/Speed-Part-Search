import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { CATEGORY_THRESHOLDS } from '@/lib/demand-forecast/benchmark';
import { getCustomThresholds, saveCustomThresholds } from '@/lib/db';
import { readCache, recalculatePartsCache } from '@/lib/demand-forecast/cache-util';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const dbThresholds = await getCustomThresholds();
    const merged = dbThresholds ? { ...CATEGORY_THRESHOLDS, ...dbThresholds } : CATEGORY_THRESHOLDS;
    return NextResponse.json({ thresholds: merged });
  } catch (err) {
    console.error('[thresholds-api]', err);
    return NextResponse.json({ error: '無法讀取水位設定' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { role?: string } }).user?.role !== 'admin') {
    return NextResponse.json({ error: '無權限' }, { status: 403 });
  }

  try {
    const { thresholds } = await req.json();
    if (!thresholds || typeof thresholds !== 'object') {
      return NextResponse.json({ error: '無效的參數格式' }, { status: 400 });
    }

    // Basic validation
    const toSave: Record<string, { minStock: number; lowStock: number }> = {};
    for (const [catId, val] of Object.entries(thresholds)) {
      const v = val as { minStock: number; lowStock: number };
      const minStock = Number(v.minStock);
      const lowStock = Number(v.lowStock);
      if (isNaN(minStock) || isNaN(lowStock) || minStock < 0 || lowStock < 0) {
        return NextResponse.json({ error: `類別 ${catId} 的水位值無效` }, { status: 400 });
      }
      toSave[catId] = { minStock, lowStock };
    }

    // Save to DB
    await saveCustomThresholds(toSave);

    // Trigger cache recalculation so parts immediately reflect the new thresholds
    let partsCache = await readCache();
    if (partsCache) {
      await recalculatePartsCache(partsCache, toSave);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[thresholds-api-post]', err);
    return NextResponse.json({ error: '儲存水位設定失敗' }, { status: 500 });
  }
}
