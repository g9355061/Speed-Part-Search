import { NextResponse } from 'next/server';
import { getMarketReportsCache, setMarketReportsCache } from '@/lib/db';
import { fetchAndAnalyzeReports } from '@/lib/demand-forecast/market-report-fetcher';
import { MARKET_REPORTS_SCHEMA_VERSION } from '@/lib/demand-forecast/market-report-types';
import type { MarketReportsFetchResult, ReviewState, MarketReport } from '@/lib/demand-forecast/market-report-types';

export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

// Cache keys
const CACHE_KEY_REPORTS = 'market_reports_v3';
const CACHE_KEY_REVIEWS = 'market_reports_reviews';
const CACHE_KEY_MANUAL = 'market_reports_manual';

async function getReviewState(): Promise<ReviewState> {
  try {
    const { getMarketReportsCache: getCache } = await import('@/lib/db');
    // Use a separate get call with the reviews key
    // For now, piggyback on the same cache mechanism
    const cached = await getCache();
    return cached?.reviewState || {};
  } catch {
    return {};
  }
}

async function getManualReports(): Promise<MarketReport[]> {
  try {
    const cached = await getMarketReportsCache();
    return cached?.manualReports || [];
  } catch {
    return [];
  }
}

function isCacheValid(cached: any): boolean {
  if (!cached) return false;
  if (!cached.schemaVersion || cached.schemaVersion < MARKET_REPORTS_SCHEMA_VERSION) {
    console.log('[MarketReportsAPI] Cache schema mismatch, invalidating.');
    return false;
  }
  if (!cached.fetchedAt || !Array.isArray(cached.reports)) return false;
  return true;
}

function applyReviewState(reports: MarketReport[], reviewState: ReviewState): MarketReport[] {
  return reports.map(r => {
    const review = reviewState[r.id];
    if (!review) return r;
    return {
      ...r,
      status: review.status,
      signalLevel: review.signalLevel,
      reviewedBy: review.reviewedBy,
      reviewedAt: review.reviewedAt,
      notes: review.notes || r.notes,
    };
  });
}

export async function GET() {
  try {
    const cached = await getMarketReportsCache();
    const now = Date.now();

    // Get persisted review state and manual reports
    const reviewState: ReviewState = cached?.reviewState || {};
    const manualReports: MarketReport[] = cached?.manualReports || [];

    if (isCacheValid(cached)) {
      const fetchedTime = Date.parse(cached.fetchedAt);
      const isExpired = isNaN(fetchedTime) || now - fetchedTime > CACHE_TTL_MS;

      // Apply review state to cached reports
      const reviewedReports = applyReviewState(cached.reports, reviewState);
      const allReports = [...reviewedReports, ...manualReports];

      if (!isExpired) {
        return NextResponse.json({
          reports: allReports,
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
          setMarketReportsCache({
            ...result,
            reviewState,
            manualReports,
          });
        })
        .catch(err => console.error('[MarketReportsAPI] Background refresh failed:', err));

      return NextResponse.json({
        reports: allReports,
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
    await setMarketReportsCache({
      ...result,
      reviewState,
      manualReports,
    });

    const reviewedReports = applyReviewState(result.reports, reviewState);
    const allReports = [...reviewedReports, ...manualReports];

    return NextResponse.json({
      reports: allReports,
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
