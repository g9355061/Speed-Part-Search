import { NextResponse } from 'next/server';
import { listWeeklyReports } from '@/lib/demand-forecast/weekly-report';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const reports = await listWeeklyReports();
    return NextResponse.json({ reports });
  } catch (err) {
    console.error('[WEEKLY_REPORTS_API] Failed to list reports:', err);
    return NextResponse.json(
      { reports: [], error: err instanceof Error ? err.message : '週報列表取得失敗' },
      { status: 500 }
    );
  }
}
