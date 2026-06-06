import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Header } from '@/components/Header';
import { buildWeeklyReport } from '@/lib/demand-forecast/weekly-report';

export const dynamic = 'force-dynamic';

function riskColor(level: string) {
  if (level === 'high') return { bg: '#FEF3F2', text: '#B42318', border: '#FECDCA', label: '高風險' };
  if (level === 'medium') return { bg: '#FFFAEB', text: '#B54708', border: '#FEDF89', label: '中風險' };
  return { bg: '#ECFDF3', text: '#027A48', border: '#ABEFC6', label: '低風險' };
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

export default async function WeeklyReportPage({ params }: { params: { id: string } }) {
  const report = await buildWeeklyReport();
  if (params.id !== report.id) notFound();

  const tone = riskColor(report.riskLevel);

  return (
    <div>
      <Header apiOnline={true} liveSourceCount={1} totalSourceCount={1} />
      <main style={{ maxWidth: 1120, margin: '0 auto', padding: '34px 24px 56px', width: '100%' }}>
        <div style={{ marginBottom: 18 }}>
          <Link href="/demand-forecast" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
            ← 回到缺料預測
          </Link>
        </div>

        <section style={{ border: `1px solid ${tone.border}`, borderLeft: `4px solid ${tone.text}`, borderRadius: 8, background: '#fff', padding: 22, marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: 'var(--text-3)', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>物料預測週報</div>
              <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.25, color: 'var(--text)' }}>{report.title}</h1>
              <p style={{ margin: '12px 0 0', fontSize: 14, color: 'var(--text-2)', lineHeight: 1.7, maxWidth: 760 }}>{report.summary}</p>
            </div>
            <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
              <span style={{ display: 'inline-flex', border: `1px solid ${tone.border}`, background: tone.bg, color: tone.text, borderRadius: 999, padding: '5px 10px', fontSize: 12, fontWeight: 800 }}>
                {tone.label}
              </span>
              <span style={{ color: 'var(--text-3)', fontSize: 12 }}>產生時間：{formatDateTime(report.generatedAt)}</span>
            </div>
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 18 }}>
          <Metric label="觀察類別" value={report.metrics.watchedCategories} tone={report.metrics.watchedCategories > 0 ? 'warning' : undefined} />
          <Metric label="缺料新聞" value={report.metrics.shortageNews} />
          <Metric label="PCN/EOL" value={report.metrics.lifecycleNews} />
          <Metric label="市場情報" value={report.metrics.marketReports} />
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(320px, 0.75fr)', gap: 16, alignItems: 'start' }}>
          <Panel title="本週重點摘要">
            <div style={{ display: 'grid', gap: 12 }}>
              {report.openingNotes.map((note) => (
                <p key={note} style={{ margin: 0, fontSize: 13.5, lineHeight: 1.75, color: 'var(--text-2)' }}>{note}</p>
              ))}
              {report.executiveItems.length === 0 ? (
                <EmptyText>本週沒有明顯外部訊號，維持例行監控即可。</EmptyText>
              ) : (
                report.executiveItems.map((item) => (
                  <div key={item.category} style={{ border: '1px solid var(--hairline)', borderRadius: 8, padding: '13px 14px', background: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 800 }}>{item.category}</div>
                    </div>
                    <h3 style={{ margin: '5px 0 8px', fontSize: 16, lineHeight: 1.35, color: 'var(--text)' }}>{item.headline}</h3>
                    <p style={{ margin: '0 0 8px', fontSize: 13, lineHeight: 1.65, color: 'var(--text-2)' }}>{item.whyItMatters}</p>
                    <div style={{ borderLeft: '3px solid #0F766E', paddingLeft: 10, marginTop: 9, fontSize: 13, lineHeight: 1.6, color: 'var(--text)', fontWeight: 650 }}>
                      建議：{item.suggestedMove}
                    </div>
                    {item.evidence.length > 0 && (
                      <div style={{ display: 'grid', gap: 4, marginTop: 10, fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-3)' }}>
                        {item.evidence.map((evidence) => <span key={evidence}>佐證：{evidence}</span>)}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel title="建議動作">
            <div style={{ display: 'grid', gap: 10 }}>
              {report.recommendedActions.map((action) => (
                <div key={action} style={{ border: '1px solid var(--hairline)', borderRadius: 8, padding: '10px 12px', background: 'var(--bg)', fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)' }}>
                  {action}
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="值得放進觀察清單的類別">
            {report.categorySignals.length === 0 ? (
              <EmptyText>本週外部訊號相對安靜，暫時沒有需要特別拉出來看的類別。</EmptyText>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {report.categorySignals.map((item) => (
                  <div key={item.categoryId} style={{ border: '1px solid var(--hairline)', borderRadius: 8, padding: '11px 12px', background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <strong style={{ fontSize: 13, color: 'var(--text)' }}>{item.category}</strong>
                      <SignalBadge tone={item.tone} />
                    </div>
                    <p style={{ margin: '7px 0 0', fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-2)' }}>{item.plainText}</p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, fontSize: 11, color: 'var(--text-3)' }}>
                      <span>缺料新聞 {item.newsCount}</span>
                      <span>PCN/EOL {item.lifecycleCount}</span>
                      <span>市場情報 {item.marketReportCount}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="新聞重點">
            {report.newsHighlights.length === 0 ? (
              <EmptyText>本週沒有明顯缺料/交期新聞。</EmptyText>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {report.newsHighlights.map((item) => (
                  <HighlightLink key={`${item.source}-${item.url}`} item={item} />
                ))}
              </div>
            )}
          </Panel>

          <Panel title="PCN / EOL 重點">
            {report.lifecycleHighlights.length === 0 ? (
              <EmptyText>本週沒有明顯 PCN/EOL 訊號。</EmptyText>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {report.lifecycleHighlights.map((item) => (
                  <HighlightLink key={`${item.source}-${item.url}`} item={item} />
                ))}
              </div>
            )}
          </Panel>

          <Panel title="市場情報摘要">
            {report.marketHighlights.length === 0 ? (
              <EmptyText>本週尚未取得可解析市場情報。</EmptyText>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {report.marketHighlights.map((item) => (
                  <HighlightLink key={`${item.source}-${item.url}`} item={item} />
                ))}
              </div>
            )}
          </Panel>
        </section>
      </main>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: 'danger' | 'warning' }) {
  const color = tone === 'danger' ? '#B42318' : tone === 'warning' ? '#B54708' : 'var(--text)';
  return (
    <div style={{ border: '1px solid var(--hairline)', borderRadius: 8, background: '#fff', padding: '12px 14px' }}>
      <div style={{ color: 'var(--text-3)', fontSize: 11, marginBottom: 5 }}>{label}</div>
      <div style={{ color, fontSize: 22, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ border: '1px solid var(--border)', borderRadius: 8, background: '#fff', padding: 16 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 15, color: 'var(--text)', fontWeight: 800 }}>{title}</h2>
      {children}
    </section>
  );
}

function EmptyText({ children }: { children: ReactNode }) {
  return <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 14, color: 'var(--text-3)', fontSize: 13 }}>{children}</div>;
}

function SignalBadge({ tone }: { tone: 'high' | 'medium' | 'normal' }) {
  const color = tone === 'high' ? '#B42318' : tone === 'medium' ? '#B54708' : '#027A48';
  const bg = tone === 'high' ? '#FEF3F2' : tone === 'medium' ? '#FFFAEB' : '#ECFDF3';
  const text = tone === 'high' ? '多來源提到' : tone === 'medium' ? '單一訊號' : '平穩';
  return <span style={{ display: 'inline-flex', borderRadius: 999, padding: '3px 8px', background: bg, color, fontSize: 11, fontWeight: 800 }}>{text}</span>;
}

function HighlightLink({ item }: { item: { title: string; source: string; url: string; summary: string } }) {
  return (
    <a href={item.url} target="_blank" rel="noreferrer" style={{ display: 'block', border: '1px solid var(--hairline)', borderRadius: 8, padding: '10px 12px', background: '#fff', color: 'inherit', textDecoration: 'none' }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 5 }}>{item.source}</div>
      <strong style={{ display: 'block', fontSize: 13, lineHeight: 1.45, color: 'var(--text)' }}>{item.title}</strong>
      {item.summary && <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.6, color: 'var(--text-2)' }}>{item.summary}</p>}
    </a>
  );
}
