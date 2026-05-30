import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { getMarketReportsCache, setMarketReportsCache } from '@/lib/db';
import type { MarketIntelStatus, MarketSignalLevel, ReviewState } from '@/lib/demand-forecast/market-report-types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Auth check: admin only
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: '僅限管理員操作' }, { status: 403 });
    }

    const body = await request.json();
    const { reportId, action, notes } = body;

    if (!reportId || !action) {
      return NextResponse.json({ error: '缺少 reportId 或 action' }, { status: 400 });
    }

    const validActions = ['confirm_evidence', 'confirm_risk', 'ignore'];
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: `無效的 action: ${action}` }, { status: 400 });
    }

    // Map action to status and signalLevel
    let newStatus: MarketIntelStatus;
    let newSignalLevel: MarketSignalLevel;

    switch (action) {
      case 'confirm_evidence':
        newStatus = 'confirmed';
        newSignalLevel = 'confirmed_evidence';
        break;
      case 'confirm_risk':
        newStatus = 'confirmed';
        newSignalLevel = 'confirmed_risk';
        break;
      case 'ignore':
        newStatus = 'ignored';
        newSignalLevel = 'no_signal';
        break;
      default:
        return NextResponse.json({ error: '無效操作' }, { status: 400 });
    }

    // Load current cache and update review state
    const cached = await getMarketReportsCache();
    const reviewState: ReviewState = cached?.reviewState || {};

    reviewState[reportId] = {
      status: newStatus,
      signalLevel: newSignalLevel,
      reviewedBy: session.user.name || session.user.email || 'admin',
      reviewedAt: new Date().toISOString(),
      notes: notes || undefined,
    };

    // Save back
    await setMarketReportsCache({
      ...cached,
      reviewState,
    });

    return NextResponse.json({
      success: true,
      reportId,
      action,
      status: newStatus,
      signalLevel: newSignalLevel,
      reviewedBy: reviewState[reportId].reviewedBy,
      reviewedAt: reviewState[reportId].reviewedAt,
    });
  } catch (err) {
    console.error('[MarketReportsReview] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '操作失敗' },
      { status: 500 }
    );
  }
}
