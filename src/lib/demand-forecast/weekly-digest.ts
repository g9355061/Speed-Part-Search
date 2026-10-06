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
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
  <p style="margin:20px 0 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:700;font-size:14px">看完整週報</a></p>
  <p style="font-size:11.5px;color:#9ca3af;margin-top:20px">Speed Part Search 缺料預測系統自動寄送。資料來源：DigiKey / Mouser 料件 API、國際媒體 RSS、公開市場報告、華強烽火指數。</p>
</div>`;

  return { subject: `【物料預測週報】${report.date}｜${headline}`, text, html };
}

/** 信件包含網站週報全文；群組 webhook 仍使用 buildWeeklyDigest 的精簡摘要。 */
export function buildWeeklyEmail(report: WeeklyReportDetail, siteUrl: string): WeeklyDigest {
  const headline = report.title.split('｜').slice(2).join('｜') || report.title;
  const link = `${siteUrl.replace(/\/$/, '')}${report.href}`;
  const risk = RISK_LABEL[report.riskLevel] ?? report.riskLevel;
  const text: string[] = [`【物料預測週報】${report.date}｜${risk}`, headline, '', report.summary, ''];
  const sections: string[] = [];
  const paragraph = (value: string) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.85;white-space:pre-wrap">${escapeHtml(value)}</p>`;
  const urlLink = (url: string, label: string) => {
    try {
      if (!['http:', 'https:'].includes(new URL(url).protocol)) return escapeHtml(label);
      return `<a href="${escapeHtml(url)}" style="color:#0F766E;text-decoration:underline">${escapeHtml(label)}</a>`;
    } catch { return escapeHtml(label); }
  };
  const section = (title: string, body: string, lines: string[]) => {
    text.push(`▍${title}`, ...lines, '');
    sections.push(`<tr><td style="padding:22px 0;border-top:1px solid #d1d5db"><h2 style="margin:0 0 14px;font-size:20px;color:#0F766E">${escapeHtml(title)}</h2>${body}</td></tr>`);
  };

  const categories = (report.categorySignals ?? []).filter(s => s.tone !== 'normal').slice(0, 6);
  const categoryLines = categories.length ? categories.map(s => `${s.category}｜${RISK_LABEL[s.tone] ?? s.tone}`) : ['本週各類別通路與市場皆平穩。'];
  section('本期涉及類別｜哪幾類有動靜', categoryLines.map(paragraph).join(''), categoryLines);

  const stories = report.executiveItems ?? [];
  const storyLines: string[] = [];
  const storyHtml = stories.map((item, i) => {
    storyLines.push(`${i + 1}. [${item.category}] ${item.headline}`, ...item.story, ...(item.watchpoint ? [`後續觀察：${item.watchpoint}`] : []), '');
    return `<div style="${i ? 'border-top:1px solid #e5e7eb;padding-top:18px;' : ''}margin-bottom:18px"><div style="color:#0F766E;font-size:12px;font-weight:700">${escapeHtml(item.category)}</div><h3 style="margin:6px 0 12px;font-size:19px;line-height:1.4">${escapeHtml(item.headline)}</h3>${item.story.map(paragraph).join('')}${item.watchpoint ? paragraph(`後續觀察：${item.watchpoint}`) : ''}</div>`;
  }).join('');
  section('封面故事｜供應鏈正在出現哪些變化', storyHtml || paragraph('本週沒有明顯外部訊號，維持例行監控即可。'), storyLines.length ? storyLines : ['本週沒有明顯外部訊號，維持例行監控即可。']);

  const actions = [...stories.filter(item => item.suggestedMove).map(item => `${item.category}：${item.suggestedMove}`), ...(report.recommendedActions ?? [])];
  section('行動建議｜採購與工程的下一步', actions.map(a => `<div style="margin-bottom:10px;padding:12px 14px;border-left:4px solid #0F766E;background:#F0FDF4">${paragraph(a)}</div>`).join(''), actions);

  // 與網站短訊欄相同：已列為參考来源的消息不重複列，最多八則。
  const unwrap = (url: string) => {
    if (!url.includes('translate.google.com')) return url;
    try { return new URL(url).searchParams.get('u') || url; } catch { return url; }
  };
  const featured = new Set((report.sourceLinks ?? []).map(s => unwrap(s.url)));
  const briefs = [
    ...(report.newsHighlights ?? []).map(s => ({ ...s, kind: '新聞' })),
    ...(report.marketHighlights ?? []).map(s => ({ ...s, kind: '公開報告' })),
    ...(report.lifecycleHighlights ?? []).map(s => ({ ...s, kind: 'PCN/EOL' })),
  ].filter(s => s.url && s.url !== '#' && !featured.has(unwrap(s.url)))
    .filter((s, i, all) => all.findIndex(other => other.url === s.url) === i).slice(0, 8);
  if (briefs.length) {
    section('本週要聞｜其他值得掃一眼的消息', briefs.map(s => `<div style="margin-bottom:16px"><div style="font-size:12px;color:#6b7280">${escapeHtml(s.kind)}｜${escapeHtml(s.source)}${s.publishedAt ? `｜${escapeHtml(s.publishedAt.slice(0, 10))}` : ''}</div><h3 style="font-size:16px;margin:6px 0">${urlLink(s.url, s.title)}</h3>${s.summary ? paragraph(s.summary) : ''}</div>`).join(''), briefs.flatMap(s => [`[${s.kind}] ${s.source}｜${s.title}`, s.summary, s.url]));
  }

  const spot = report.spotMarket;
  if (spot) {
    const fmtPct = (v: number | null | undefined) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
    const trend = spot.trend;
    const trendText = trend ? `${trend.text}（搜索 ${trend.search?.value ?? '—'}、庫存 ${trend.stock?.value ?? '—'}、價格 ${trend.price?.value ?? '—'}；年增 ${fmtPct(trend.search?.yoyPct)}／${fmtPct(trend.stock?.yoyPct)}／${fmtPct(trend.price?.yoyPct)}）` : '';
    const overview = `華強烽火指數當日熱料共 ${spot.hotParts.length} 顆；${spot.hasPrevious ? `本週新上榜 ${spot.hotParts.filter(p => p.isNew).length} 顆。` : '本期為首次快照，下期起可比較新上榜。'}這份清單與本站 150 顆基準料無關，不互相比對。`;
    const parts = [...spot.hotParts].sort((a, b) => ((b.isNew ? 10 : 0) + Math.min(b.weeksOnList, 9)) - ((a.isNew ? 10 : 0) + Math.min(a.weeksOnList, 9))).slice(0, 12);
    const status = (p: typeof parts[number]) => p.isNew ? '本週新上榜' : p.weeksOnList > 1 ? `連續 ${p.weeksOnList} 次在榜` : '在榜';
    const cell = (value: string) => `<td style="padding:8px 5px;border-bottom:1px solid #e5e7eb;word-break:break-word">${escapeHtml(value)}</td>`;
    const table = `<table role="table" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px"><thead><tr>${['料號', '品牌', '參考價（¥）', '歸類', '狀態'].map(s => `<th style="padding:8px 5px;text-align:left;border-bottom:2px solid #d1d5db">${s}</th>`).join('')}</tr></thead><tbody>${parts.map(p => `<tr>${[p.mpn, p.brand, String(p.priceCny ?? '—'), p.categoryLabel, status(p)].map(cell).join('')}</tr>`).join('')}</tbody></table>`;
    const note = '列出前 12 顆，新上榜與連續在榜優先；完整清單見缺料預測頁「華強現貨熱料」面板。';
    section('現貨市場｜深圳現貨買家本週在找什麼', (trendText ? paragraph(trendText) : '') + paragraph(overview) + table + paragraph(note) + urlLink(spot.sourceUrl, '來源：華強電子網 烽火指數'), [trendText, overview, '料號｜品牌｜參考價（¥）｜歸類｜狀態', ...parts.map(p => `${p.mpn}｜${p.brand}｜${p.priceCny ?? '—'}｜${p.categoryLabel}｜${status(p)}`), note, `來源：${spot.sourceUrl}`].filter(Boolean));
  }

  const ongoing = report.lifecycleOngoing ?? [];
  if (ongoing.length) {
    const lines = ongoing.map(item => `${item.mpn}${item.manufacturer ? `（${item.manufacturer}）` : ''} ${item.status}，自 ${item.sinceDate} 起`);
    const note = '這些料不再逐期重寫，請對照 BOM 確認替代方案進度。';
    section('長期觀察｜前幾期已報過、仍在異常狀態的料號', lines.map(paragraph).join('') + paragraph(note), [...lines, note]);
  }
  if (report.sourceLinks?.length) {
    section('本文參考來源｜想看原文可以從這裡', report.sourceLinks.map(s => `<div style="margin-bottom:14px">${urlLink(s.url, s.title)}<div style="font-size:12px;color:#6b7280;margin-top:4px">${escapeHtml([s.kind, s.source, s.dateLabel].filter(Boolean).join('｜'))}</div></div>`).join(''), report.sourceLinks.flatMap(s => [s.title, [s.kind, s.source, s.dateLabel].filter(Boolean).join('｜'), s.url]));
  }
  text.push(`網站週報：${link}`);
  const html = `<div style="font-family:Arial,'Noto Sans TC',sans-serif;max-width:720px;margin:0 auto;padding:16px;color:#111827"><div style="border-bottom:2px solid #111827;padding-bottom:10px;font-size:14px;font-weight:700">物料預測週報｜電子零組件供應鏈週刊</div><p style="font-size:12px;color:#6b7280">${escapeHtml(report.date)} 出刊｜${escapeHtml(risk)}</p><h1 style="font-size:24px;line-height:1.4">${escapeHtml(headline)}</h1>${paragraph(report.summary)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tbody>${sections.join('')}</tbody></table><p style="font-size:12px;color:#6b7280">${urlLink(link, '在網站檢視本期週報')}｜Speed Part Search</p></div>`;
  return { subject: `【物料預測週報】${report.date}｜${headline}`, text: text.join('\n'), html };
}
