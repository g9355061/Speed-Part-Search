import { NextResponse } from 'next/server';
import { getMarketReportsCache, setMarketReportsCache } from '@/lib/db';
import { fetchAndAnalyzeReports } from '@/lib/demand-forecast/market-report-fetcher';
import { MARKET_REPORTS_SCHEMA_VERSION } from '@/lib/demand-forecast/market-report-types';

export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

function isCacheValid(cached: any): boolean {
  if (!cached) return false;
  if (!cached.schemaVersion || cached.schemaVersion < MARKET_REPORTS_SCHEMA_VERSION) {
    console.log('[MarketReportsAPI] Cache schema mismatch, invalidating.');
    return false;
  }
  if (!cached.fetchedAt || !Array.isArray(cached.reports)) return false;
  return true;
}

export async function GET() {
  try {
    const cached = await getMarketReportsCache();
    const now = Date.now();

    if (isCacheValid(cached)) {
      const fetchedTime = Date.parse(cached.fetchedAt);
      const isExpired = isNaN(fetchedTime) || now - fetchedTime > CACHE_TTL_MS;

      if (!isExpired) {
        return NextResponse.json({
          reports: cached.reports,
          sourceResults: cached.sourceResults ?? [],
          fetchedAt: cached.fetchedAt,
          schemaVersion: cached.schemaVersion,
          fromCache: true,
        });
      }

      // SWR: return stale, refresh in background
      console.log('[MarketReportsAPI] Cache expired, triggering background refresh...');
      fetchAndAnalyzeReports()
        .then(result => {
          setMarketReportsCache(result);
        })
        .catch(err => console.error('[MarketReportsAPI] Background refresh failed:', err));

      return NextResponse.json({
        reports: cached.reports,
        sourceResults: cached.sourceResults ?? [],
        fetchedAt: cached.fetchedAt,
        schemaVersion: cached.schemaVersion,
        fromCache: true,
        stale: true,
      });
    }

    // No valid cache, real-time fetch
    console.log('[MarketReportsAPI] No valid cache, performing real-time fetch...');
    const result = await fetchAndAnalyzeReports();
    await setMarketReportsCache(result);

    return NextResponse.json({
      reports: result.reports,
      sourceResults: result.sourceResults,
      fetchedAt: result.fetchedAt,
      schemaVersion: result.schemaVersion,
      fromCache: false,
    });
  } catch (err) {
    console.error('[MarketReportsAPI] Error:', err);
    return NextResponse.json({
      reports: [],
      sourceResults: [],
      fetchedAt: new Date().toISOString(),
      schemaVersion: MARKET_REPORTS_SCHEMA_VERSION,
      error: err instanceof Error ? err.message : '取得情報失敗',
    });
  }
}
