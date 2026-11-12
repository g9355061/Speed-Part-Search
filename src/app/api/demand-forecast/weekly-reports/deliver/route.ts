import { NextRequest, NextResponse } from 'next/server';
import { getCachedWeeklyReport } from '@/lib/demand-forecast/weekly-report';
import { buildWeeklyDigest, buildWeeklyEmail } from '@/lib/demand-forecast/weekly-digest';
import { weeklyDeliveryRecipients, WEEKLY_OWNER_EMAIL } from '@/lib/demand-forecast/weekly-delivery-policy';
import { isEmailConfigured, sendWeeklyDigestEmail } from '@/lib/email';
import { claimWeeklyDelivery, listUsers, setGenericCacheOrThrow } from '@/lib/db';

export const dynamic = 'force-dynamic';

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 排程僅在核准後啟用；test=1 永遠只寄 Danny，且不占用正式投遞紀錄。 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return NextResponse.json({ error: '需要 x-cron-secret' }, { status: 401 });
  }
  const force = req.nextUrl.searchParams.get('force') === '1';
  const preview = req.nextUrl.searchParams.get('preview') === '1';
  const test = req.nextUrl.searchParams.get('test') === '1';
  const enabled = process.env.WEEKLY_REPORT_EMAIL_ENABLED === 'true';
  // 尚未核准時排程完全不投遞（包含既有 webhook）。
  if (!enabled && !test && !preview) {
    return NextResponse.json({ delivered: false, reason: '等待管理者確認；每週自動寄送尚未啟用', disabled: true });
  }
  try {
    const report = await getCachedWeeklyReport();
    const siteUrl = process.env.NEXTAUTH_URL || process.env.FORECAST_BASE_URL || 'http://localhost:5280';
    const digest = buildWeeklyEmail(report, siteUrl);
    const recipients = weeklyDeliveryRecipients(test ? [] : await listUsers(), test, enabled);
    if (preview) return NextResponse.json({ reportId: report.id, recipients, enabled, test, editorial: report.editorial ?? null, ...digest });
    if (!isEmailConfigured) return NextResponse.json({ delivered: false, error: 'Gmail API / SMTP 未設定' }, { status: 503 });
    if (!recipients.length) return NextResponse.json({ delivered: false, error: '沒有已核准管理者' }, { status: 422 });

    // 審稿不過關（AI 撰稿失敗的範本稿、標題空洞、內容對不上素材）的期別不自動寄給管理者，
    // 改寄一封通知給 Danny；確認內容可以出刊後用 force=1 人工放行。test=1 仍可寄全文給 Danny 檢視。
    const held = report.editorial?.status === 'held';
    if (held && !force && !test) {
      const issues = report.editorial?.issues ?? [];
      const reportUrl = `${siteUrl.replace(/\/$/, '')}${report.href}`;
      let notified = false;
      if (await claimWeeklyDelivery(`weekly-report-delivery-hold-${report.id}`)) {
        const subject = `【週報暫停寄送】${report.date}｜審稿未通過，請確認`;
        const text = `本期週報（${report.title}）未通過審稿，沒有寄給管理者。\n\n問題：\n${issues.map((issue) => `- ${issue}`).join('\n')}\n\n檢視本期：${reportUrl}\n確認可以出刊後，請以 force=1 呼叫投遞端點人工放行。`;
        const html = `<p>本期週報（${escapeHtml(report.title)}）未通過審稿，<b>沒有寄給管理者</b>。</p><ul>${issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join('')}</ul><p><a href="${escapeHtml(reportUrl)}">檢視本期週報</a></p><p>確認可以出刊後，請以 force=1 呼叫投遞端點人工放行。</p>`;
        try {
          await sendWeeklyDigestEmail([WEEKLY_OWNER_EMAIL], subject, text, html);
          notified = true;
        } catch (err) {
          console.error('[WeeklyDeliver] hold notice failed:', err);
        }
      }
      return NextResponse.json({ delivered: false, held: true, notified, reportId: report.id, issues, reason: `審稿未通過，本期暫停自動寄送（${issues.length} 項問題）；確認後加 force=1 放行` });
    }

    const results: Record<string, string> = {};
    const failures: string[] = [];
    const skipped: string[] = [];
    const deliver = async (channel: string, identity: string, send: () => Promise<string>) => {
      const key = `weekly-report-delivery-${test ? 'test' : 'live'}-${report.id}-${channel}-${identity}`;
      if (!await claimWeeklyDelivery(key, force)) { skipped.push(identity); return; }
      try {
        const messageId = await send();
        // 紀錄失敗保留 sending，不自動重寄，避免結果不明時產生重複信。
        results[identity] = messageId;
        await setGenericCacheOrThrow(key, { status: 'sent', deliveredAt: new Date().toISOString(), messageId, subject: digest.subject });
      } catch (err) {
        failures.push(`${identity}: ${err instanceof Error ? err.message : String(err)}`);
        // 僅有明確 HTTP 拒絕／SMTP 拒絕才允許下次自動重試。逾時可能已寄出。
        if (!results[identity] && /HTTP (4|5)\d\d|EENVELOPE|EAUTH/.test(String(err))) {
          await setGenericCacheOrThrow(key, { status: 'failed', failedAt: new Date().toISOString() });
        }
      }
    };
    for (const recipient of recipients) {
      await deliver('email', recipient, () => sendWeeklyDigestEmail([recipient], digest.subject, digest.text, digest.html));
    }
    // 測試模式絕不送群組，正式模式沿用既有 webhook。
    if (!test && process.env.WEEKLY_REPORT_WEBHOOK_URL) {
      const webhookUrl = process.env.WEEKLY_REPORT_WEBHOOK_URL;
      await deliver('webhook', 'group', async () => {
        const res = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: buildWeeklyDigest(report, siteUrl).text }), signal: AbortSignal.timeout(15_000) });
        if (!res.ok) throw new Error(`webhook HTTP ${res.status}`);
        return `HTTP ${res.status}`;
      });
    }
    return NextResponse.json({ delivered: Object.keys(results).length > 0, reportId: report.id, subject: digest.subject, test, results, skipped, failures, reason: skipped.length ? '已寄送或寄送結果待確認；需要人工重寄時加 force=1' : undefined }, { status: failures.length ? 502 : 200 });
  } catch (err) {
    console.error('[WeeklyDeliver] failed:', err);
    return NextResponse.json({ delivered: false, error: '週報投遞失敗，請檢查服務紀錄' }, { status: 500 });
  }
}
