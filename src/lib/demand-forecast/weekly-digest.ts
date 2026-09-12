import type { WeeklyReportDetail } from './weekly-report';

/**
 * 週報摘要（主動投遞用）——2026-09-12
 *
 * 正式站實測：7 月底之後每週登入 0–2 次，週報每週建好卻沒人看。採購不會主動登入內部網站，
 * 所以改成「週一建完就推出去」：摘要寄信或貼到群組，網站只是想看細節時再點進來。
 * 同一份內容輸出三種格式：純文字（webhook／群組）、HTML（信件）、subject。
 */

export interface WeeklyDigest {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const RISK_LABEL: Record<string, string> = { high: '高風險', medium: '中風險', normal: '平穩' };

export function buildWeeklyDigest(report: WeeklyReportDetail, siteUrl: string): WeeklyDigest {
  const link = `${siteUrl.replace(/\/$/, '')}${report.href}`;
  const headline = report.title.split('｜').slice(2).join('｜') || report.title;
  const risk = RISK_LABEL[report.riskLevel] ?? report.riskLevel;
  const stories = report.executiveItems.slice(0, 4);
  const ongoing = report.lifecycleOngoing ?? [];
  const spot = report.spotMarket;

  // ---- 純文字（Teams / Slack / LINE 群組貼文都吃得下）----
  const lines: string[] = [];
  lines.push(`【物料預測週報】${report.date}｜${risk}`);
  lines.push(headline);
  lines.push('');
  lines.push(report.summary);
  lines.push('');
  if (stories.length > 0) {
    lines.push('▍封面故事');
    stories.forEach((item, i) => {
      lines.push(`${i + 1}. [${item.category}] ${item.headline}`);
      if (item.story[0]) lines.push(`   ${item.story[0]}`);
      if (item.suggestedMove) lines.push(`   → 行動：${item.suggestedMove}`);
    });
    lines.push('');
  }
  if (spot?.trend) {
    lines.push('▍現貨市場');
    lines.push(spot.trend.text);
    lines.push('');
  }
  if (ongoing.length > 0) {
    lines.push('▍長期觀察');
    lines.push(ongoing.map((o) => `${o.mpn} ${o.status}（自 ${o.sinceDate}）`).join('；'));
    lines.push('');
  }
  lines.push(`完整內容：${link}`);
  const text = lines.join('\n');

  // ---- HTML 信件 ----
  const storyHtml = stories.map((item, i) => `
    <tr><td style="padding:12px 0;border-top:1px solid #e5e7eb">
      <div style="font-size:12px;color:#0F766E;font-weight:700">${escapeHtml(item.category)}</div>
      <div style="font-size:16px;font-weight:800;margin:4px 0 6px">${i + 1}. ${escapeHtml(item.headline)}</div>
      ${item.story[0] ? `<div style="font-size:14px;line-height:1.7;color:#374151">${escapeHtml(item.story[0])}</div>` : ''}
      ${item.suggestedMove ? `<div style="margin-top:8px;padding:8px 10px;background:#F0FDF4;border-left:3px solid #0F766E;font-size:13.5px;line-height:1.6"><strong>行動建議</strong>　${escapeHtml(item.suggestedMove)}</div>` : ''}
    </td></tr>`).join('');
  const html = `
<div style="font-family:-apple-system,'Segoe UI','Noto Sans TC',sans-serif;max-width:680px;margin:0 auto;color:#111827">
  <div style="border-bottom:2px solid #111827;padding-bottom:8px;margin-bottom:12px">
    <span style="font-size:15px;font-weight:900;letter-spacing:.12em">物料預測週報</span>
    <span style="font-size:12px;color:#6b7280;margin-left:10px">${escapeHtml(report.date)} 出刊｜${escapeHtml(risk)}</span>
  </div>
  <h1 style="font-size:22px;line-height:1.3;margin:0 0 10px">${escapeHtml(headline)}</h1>
  <p style="font-size:15px;line-height:1.8;color:#374151;border-left:3px solid #d1d5db;padding-left:10px;margin:0 0 16px">${escapeHtml(report.summary)}</p>
  ${stories.length > 0 ? `<div style="font-size:12px;color:#0F766E;font-weight:900;letter-spacing:.08em">封面故事</div><table style="width:100%;border-collapse:collapse">${storyHtml}</table>` : ''}
  ${spot?.trend ? `<p style="font-size:13.5px;line-height:1.7;color:#374151;margin:16px 0 0"><strong>現貨市場</strong>　${escapeHtml(spot.trend.text)}</p>` : ''}
  ${ongoing.length > 0 ? `<p style="font-size:13px;line-height:1.7;color:#6b7280;margin:12px 0 0"><strong>長期觀察</strong>　${escapeHtml(ongoing.map((o) => `${o.mpn} ${o.status}（自 ${o.sinceDate}）`).join('；'))}</p>` : ''}
  <p style="margin:20px 0 0"><a href="${link}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:700;font-size:14px">看完整週報</a></p>
  <p style="font-size:11.5px;color:#9ca3af;margin-top:20px">Speed Part Search 缺料預測系統自動寄送。資料來源：DigiKey / Mouser 料件 API、國際媒體 RSS、公開市場報告、華強烽火指數。</p>
</div>`;

  return { subject: `【物料預測週報】${report.date}｜${headline}`, text, html };
}
