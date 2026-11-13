import { NextResponse } from 'next/server';
import { getMarketReportsCache, setMarketReportsCache } from '@/lib/db';
import { fetchAndAnalyzeReports } from '@/lib/demand-forecast/market-report-fetcher';
import { MARKET_REPORTS_SCHEMA_VERSION, type MarketReport } from '@/lib/demand-forecast/market-report-types';
import { isTranslatedZh, mapWithConcurrency, translateToZhTW } from '@/lib/demand-forecast/translate';

export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天
const attemptedReportTranslations = new Set<string>();

/** 補譯舊快取中尚未翻成繁中的標題與證據原文，避免前端再打外部翻譯。 */
async function ensureMarketReportsTranslated(reports: MarketReport[]): Promise<{ reports: MarketReport[]; changed: boolean }> {
  let changed = false;
  const targets = reports.filter((r) => {
    const needTitle = !r.titleZh && !!r.title && !isTranslatedZh(r.title) && !attemptedReportTranslations.has(`t:${r.id}:${r.title}`);
    const needEvidence = !r.evidenceTextZh && !!r.evidenceText && !isTranslatedZh(r.evidenceText) && !attemptedReportTranslations.has(`e:${r.id}:${r.evidenceText}`);
    return needTitle || needEvidence;
  });
  if (targets.length === 0) return { reports, changed: false };

  if (attemptedReportTranslations.size > 500) attemptedReportTranslations.clear();

  const updatedById = new Map<string, MarketReport>();
  await mapWithConcurrency(targets, 4, async (report) => {
    let next = report;
    const titleNeedsTx = !report.titleZh && !!report.title && !isTranslatedZh(report.title);
    if (titleNeedsTx) {
      attemptedReportTranslations.add(`t:${report.id}:${report.title}`);
      const translatedTitle = await translateToZhTW(report.title);
      if (translatedTitle && isTranslatedZh(translatedTitle)) {
        next = { ...next, titleZh: translatedTitle, title: translatedTitle };
        changed = true;
      }
    }
    const evidenceNeedsTx = !report.evidenceTextZh && !!report.evidenceText && !isTranslatedZh(report.evidenceText);
    if (evidenceNeedsTx) {
      attemptedReportTranslations.add(`e:${report.id}:${report.evidenceText}`);
      const translatedEvidence = await translateToZhTW(report.evidenceText);
      if (translatedEvidence && isTranslatedZh(translatedEvidence)) {
        next = { ...next, evidenceTextZh: translatedEvidence };
        changed = true;
      }
    }
    updatedById.set(report.id, next);
  });

  if (!changed) return { reports, changed: false };
  return {
    reports: reports.map((r) => updatedById.get(r.id) ?? r),
    changed: true,
  };
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

export async function GET() {
  try {
    const cached = await getMarketReportsCache();
    const now = Date.now();

    if (isCacheValid(cached)) {
      const { reports: hydratedReports, changed } = await ensureMarketReportsTranslated(cached.reports);
      const nextCached = changed ? { ...cached, reports: hydratedReports } : cached;
      if (changed) {
        setMarketReportsCache(nextCached).catch((err) => console.error('[MarketReportsAPI] Backfill save failed:', err));
      }

      const fetchedTime = Date.parse(nextCached.fetchedAt);
      const isExpired = isNaN(fetchedTime) || now - fetchedTime > CACHE_TTL_MS;

      if (!isExpired) {
        return NextResponse.json({
          reports: nextCached.reports,
          sourceResults: nextCached.sourceResults ?? [],
          fetchedAt: nextCached.fetchedAt,
          schemaVersion: nextCached.schemaVersion,
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
        reports: nextCached.reports,
        sourceResults: nextCached.sourceResults ?? [],
        fetchedAt: nextCached.fetchedAt,
        schemaVersion: nextCached.schemaVersion,
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
