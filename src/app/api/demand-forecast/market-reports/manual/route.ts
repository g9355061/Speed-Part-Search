import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { getMarketReportsCache, setMarketReportsCache } from '@/lib/db';
import type { MarketReport } from '@/lib/demand-forecast/market-report-types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Auth check: admin only
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '僅限管理員操作' }, { status: 403 });
    }

    const body = await request.json();
    const {
      source,
      title,
      url,
      publishedAt,
      categoryIds,
      riskTypes,
      summaryZh,
      evidenceText,
      signalLevel,
      confidence,
      notes,
    } = body;

    // Validate inputs
    if (!source || !title || !url || !categoryIds || !Array.isArray(categoryIds) || categoryIds.length === 0 || !riskTypes || !Array.isArray(riskTypes) || !summaryZh || !evidenceText || !signalLevel || !confidence) {
      return NextResponse.json({ error: '缺少必要的匯入欄位或格式不正確' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const adminName = session.user.name || session.user.email || 'admin';

    // Build the new MarketReport object
    const newReport: MarketReport = {
      id: `manual-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      source,
      title,
      url,
      publishedAt: publishedAt || null,
      fetchedAt: now,
      categoryIds,
      signalLevel, // 'confirmed_evidence' | 'confirmed_risk'
      riskTypes,
      summaryZh,
      evidenceText,
      confidence,
      status: 'confirmed',
      extractionMethod: 'manual_input',
      sourceStatus: 'ok',
      notes: notes || undefined,
      reviewedBy: adminName,
      reviewedAt: now,
    };

    // Load current cache
    const cached = await getMarketReportsCache();
    const manualReports: MarketReport[] = cached?.manualReports || [];

    // Push new report
    manualReports.push(newReport);

    // Save back to cache
    await setMarketReportsCache({
      ...cached,
      manualReports,
    });

    return NextResponse.json({
      success: true,
      report: newReport,
    });
  } catch (err) {
    console.error('[MarketReportsManual] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '操作失敗' },
      { status: 500 }
    );
  }
}
