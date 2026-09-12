import { NextRequest, NextResponse } from 'next/server';
import { getCachedWeeklyReport } from '@/lib/demand-forecast/weekly-report';
import { buildWeeklyDigest } from '@/lib/demand-forecast/weekly-digest';
import { isEmailConfigured, sendWeeklyDigestEmail } from '@/lib/email';
import { getGenericCache, setGenericCache } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * 週報主動投遞（2026-09-12）。由 weekly-report-build workflow 在本週週報固化後呼叫，只認 x-cron-secret。
 *
 * 管道（環境變數設哪個就走哪個，可同時）：
 *   - WEEKLY_REPORT_RECIPIENTS：逗號分隔的收件信箱；需 SMTP_HOST / SMTP_USER / SMTP_PASS
 *   - WEEKLY_REPORT_WEBHOOK_URL：Teams / Slack incoming webhook，POST {"text": 純文字摘要}
 * 同一期只投遞一次（generic cache 記錄），?force=1 可重寄；?preview=1 只回摘要不寄。
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return NextResponse.json({ error: '需要 x-cron-secret' }, { status: 401 });
  }
  const force = req.nextUrl.searchParams.get('force') === '1';
  const preview = req.nextUrl.searchParams.get('preview') === '1';

  try {
    const report = await getCachedWeeklyReport();
    const siteUrl = process.env.NEXTAUTH_URL || process.env.FORECAST_BASE_URL || 'http://localhost:5280';
    const digest = buildWeeklyDigest(report, siteUrl);
    if (preview) return NextResponse.json({ reportId: report.id, ...digest });

    const recipients = (process.env.WEEKLY_REPORT_RECIPIENTS || '').split(/[,\s;]+/).map((s) => s.trim()).filter(Boolean);
    const webhookUrl = process.env.WEEKLY_REPORT_WEBHOOK_URL || '';
    const channels: string[] = [];
    if (recipients.length > 0) channels.push('email');
    if (webhookUrl) channels.push('webhook');
    if (channels.length === 0) {
      return NextResponse.json({
        delivered: false,
        reportId: report.id,
        reason: '未設定任何投遞管道：請在 Railway 設 WEEKLY_REPORT_RECIPIENTS（逗號分隔信箱，需 SMTP_HOST/SMTP_USER/SMTP_PASS）或 WEEKLY_REPORT_WEBHOOK_URL（Teams/Slack incoming webhook）',
      });
    }

    const stateKey = `weekly-report-delivered-${report.id}`;
    const prior: any = await getGenericCache(stateKey).catch(() => null);
    if (prior?.deliveredAt && !force) {
      return NextResponse.json({ delivered: false, reportId: report.id, reason: `本期已於 ${prior.deliveredAt} 投遞（${(prior.channels || []).join('、')}）；要重寄請加 ?force=1` });
    }

    const results: Record<string, string> = {};
    const failures: string[] = [];

    if (recipients.length > 0) {
      if (!isEmailConfigured) {
        failures.push('email: SMTP 未設定（需要 SMTP_HOST / SMTP_USER / SMTP_PASS）');
      } else {
        try {
          results.email = `已寄給 ${recipients.length} 人（${await sendWeeklyDigestEmail(recipients, digest.subject, digest.text, digest.html)}）`;
        } catch (err) {
          failures.push(`email: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    if (webhookUrl) {
      try {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: digest.text }),
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) failures.push(`webhook: HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 120)}`);
        else results.webhook = `HTTP ${res.status}`;
      } catch (err) {
        failures.push(`webhook: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const delivered = Object.keys(results).length > 0;
    if (delivered) {
      await setGenericCache(stateKey, { deliveredAt: new Date().toISOString(), channels: Object.keys(results), subject: digest.subject }).catch(() => undefined);
    }
    return NextResponse.json({ delivered, reportId: report.id, subject: digest.subject, results, failures }, { status: delivered || failures.length === 0 ? 200 : 502 });
  } catch (err) {
    console.error('[WeeklyDeliver] failed:', err);
    return NextResponse.json({ delivered: false, error: err instanceof Error ? err.message : '投遞失敗' }, { status: 500 });
  }
}
