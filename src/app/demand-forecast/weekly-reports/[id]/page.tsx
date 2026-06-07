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
          <Metric label="PCN 或 EOL" value={report.metrics.lifecycleNews} />
          <Metric label="公開報告" value={report.metrics.marketReports} />
        </section>

        <div style={{ display: 'grid', gap: 18 }}>
          <ArticleSection eyebrow="編輯室觀察" title="本週先讀這段">
            {report.openingNotes.map((note) => (
              <p key={note} style={{ margin: '0 0 10px', fontSize: 16, lineHeight: 1.85, color: 'var(--text-2)' }}>{note}</p>
            ))}
          </ArticleSection>

          <ArticleSection eyebrow="封面故事" title="供應鏈正在出現哪些變化">
            {report.executiveItems.length === 0 ? (
              <EmptyText>本週沒有明顯外部訊號，維持例行監控即可。</EmptyText>
            ) : (
              <div style={{ display: 'grid', gap: 18 }}>
                {report.executiveItems.map((item, index) => (
                  <article key={item.category} style={{ borderTop: index === 0 ? 'none' : '1px solid var(--hairline)', paddingTop: index === 0 ? 0 : 18 }}>
                    <div style={{ fontSize: 12, color: '#0F766E', fontWeight: 900, letterSpacing: '0.04em', marginBottom: 6 }}>{item.category}</div>
                    <h3 style={{ margin: '0 0 10px', fontSize: 22, lineHeight: 1.35, color: 'var(--text)' }}>{item.headline}</h3>
                    <p style={{ margin: '0 0 10px', fontSize: 15.5, lineHeight: 1.8, color: 'var(--text-2)' }}>{item.whyItMatters}</p>
                  </article>
                ))}
              </div>
            )}
          </ArticleSection>

          <ArticleSection eyebrow="封面故事後續" title="這週先做這幾件事">
            <div style={{ display: 'grid', gap: 10 }}>
              {report.executiveItems.map((item) => (
                <div key={`${item.category}-${item.suggestedMove}`} style={{ border: '1px solid #D1FAE5', borderLeft: '4px solid #0F766E', borderRadius: 8, padding: '12px 14px', background: '#F0FDF4', fontSize: 15, lineHeight: 1.7, color: 'var(--text)', fontWeight: 700 }}>
                  <span style={{ display: 'block', fontSize: 12, color: '#0F766E', fontWeight: 900, marginBottom: 4 }}>{item.category}</span>
                  {item.suggestedMove}
                </div>
              ))}
              {report.recommendedActions.map((action) => (
                <div key={action} style={{ border: '1px solid #D1FAE5', borderRadius: 8, padding: '12px 14px', background: '#F0FDF4', fontSize: 15, lineHeight: 1.7, color: 'var(--text-2)', fontWeight: 650 }}>
                  {action}
                </div>
              ))}
            </div>
          </ArticleSection>

          {report.sourceLinks.length > 0 && (
            <ArticleSection eyebrow="本文參考來源" title="想看原文可以從這裡">
              <div style={{ display: 'grid', gap: 8 }}>
                {report.sourceLinks.map((item) => (
                  <a key={`${item.kind}-${item.source}-${item.url}`} href={item.url} target="_blank" rel="noreferrer" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', border: '1px solid var(--hairline)', borderRadius: 8, padding: '10px 12px', background: '#fff', color: 'inherit', textDecoration: 'none' }}>
                    <span style={{ minWidth: 0 }}>
                      <strong style={{ display: 'block', fontSize: 13, lineHeight: 1.45, color: 'var(--text)' }}>{item.title}</strong>
                      <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 4, fontSize: 11.5, color: 'var(--text-3)' }}>
                        <span>{item.source}</span>
                        {item.dateLabel && <span style={{ fontWeight: 750, color: '#475467' }}>{item.dateLabel}</span>}
                      </span>
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {item.dateLabel && (
                        <span style={{ whiteSpace: 'nowrap', borderRadius: 999, padding: '3px 8px', background: '#F2F4F7', color: '#344054', fontSize: 11, fontWeight: 800 }}>
                          {item.dateLabel.replace(/^新聞時間\s*/, '').replace(/^報告時間\s*/, '')}
                        </span>
                      )}
                      <span style={{ whiteSpace: 'nowrap', borderRadius: 999, padding: '3px 8px', background: '#F0FDF4', color: '#0F766E', fontSize: 11, fontWeight: 800 }}>{item.kind}</span>
                    </span>
                  </a>
                ))}
              </div>
            </ArticleSection>
          )}

        </div>
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

function ArticleSection({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section style={{ border: '1px solid var(--border)', borderRadius: 8, background: '#fff', padding: '22px 24px' }}>
      <div style={{ color: '#0F766E', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{eyebrow}</div>
      <h2 style={{ margin: '0 0 14px', fontSize: 22, lineHeight: 1.35, color: 'var(--text)', fontWeight: 900 }}>{title}</h2>
      {children}
    </section>
  );
}

function EmptyText({ children }: { children: ReactNode }) {
  return <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 14, color: 'var(--text-3)', fontSize: 13 }}>{children}</div>;
}
