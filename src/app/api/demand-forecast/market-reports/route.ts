import { NextResponse } from 'next/server';
import { getMarketReportsCache, setMarketReportsCache } from '@/lib/db';
import { fetchAndAnalyzeReports } from '@/lib/demand-forecast/market-report-fetcher';

export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

export async function GET() {
  try {
    const cached = await getMarketReportsCache();
    const now = Date.now();

    if (cached && cached.reports && cached.fetchedAt) {
      const fetchedTime = Date.parse(cached.fetchedAt);
      const isExpired = isNaN(fetchedTime) || now - fetchedTime > CACHE_TTL_MS;

      if (!isExpired) {
        // 快取未過期，直接回傳
        return NextResponse.json({ reports: cached.reports, fetchedAt: cached.fetchedAt, fromCache: true });
      }

      // 快取過期，啟用背景更新 (不 await)，先回傳舊快取 (Stale-While-Revalidate)
      console.log('[MarketReportsAPI] Cache expired, triggering background refresh...');
      fetchAndAnalyzeReports()
        .then(newReports => {
          setMarketReportsCache({
            reports: newReports,
            fetchedAt: new Date().toISOString()
          });
          console.log('[MarketReportsAPI] Background refresh completed.');
        })
        .catch(err => {
          console.error('[MarketReportsAPI] Background refresh failed:', err);
        });

      return NextResponse.json({ reports: cached.reports, fetchedAt: cached.fetchedAt, fromCache: true, stale: true });
    }

    // 完全沒有快取，實時抓取並 await
    console.log('[MarketReportsAPI] No cache found, performing real-time fetch & analyze...');
    const reports = await fetchAndAnalyzeReports();
    await setMarketReportsCache({
      reports,
      fetchedAt: new Date().toISOString()
    });

    return NextResponse.json({ reports, fetchedAt: new Date().toISOString(), fromCache: false });
  } catch (err) {
    console.error('[MarketReportsAPI] Error:', err);
    // graceful fallback: 即使壞掉也不影響整個系統，回傳空 array
    return NextResponse.json({ reports: [], error: err instanceof Error ? err.message : '取得情報失敗' });
  }
}
