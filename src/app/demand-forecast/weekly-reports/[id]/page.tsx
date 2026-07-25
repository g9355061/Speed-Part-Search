import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Header } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { getWeeklyReportById } from '@/lib/demand-forecast/weekly-report';

export const dynamic = 'force-dynamic';

function riskColor(level: string) {
  if (level === 'high') return { bg: '#FEF3F2', text: '#B42318', border: '#FECDCA', label: '高風險' };
  if (level === 'medium') return { bg: '#FFFAEB', text: '#B54708', border: '#FEDF89', label: '中風險' };
  return { bg: '#ECFDF3', text: '#027A48', border: '#ABEFC6', label: '正常' };
}

type WeeklyRiskLevel = 'high' | 'medium' | 'normal';

function WeeklyRiskStatus({ level, label, uniform = false }: { level: string; label: string; uniform?: boolean }) {
  const normalizedLevel: WeeklyRiskLevel = level === 'high' || level === 'medium' ? level : 'normal';
  const icon = normalizedLevel === 'high' ? 'alert' : normalizedLevel === 'medium' ? 'info' : 'check';

  return (
    <span className={`forecast-inline-status forecast-inline-status-${normalizedLevel}${uniform ? ' forecast-risk-level-status' : ''}`}>
      <span className="forecast-inline-status-icon"><Icon name={icon} size={12} stroke={2} /></span>
      <span>{label}</span>
    </span>
  );
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
  const report = await getWeeklyReportById(params.id);
  if (!report) notFound();

  const tone = riskColor(report.riskLevel);

  return (
    <div>
      <Header />
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
              <WeeklyRiskStatus level={report.riskLevel} label={tone.label} uniform />
              <span style={{ color: 'var(--text-3)', fontSize: 12 }}>產生時間：{formatDateTime(report.generatedAt)}</span>
            </div>
          </div>
        </section>

        <div style={{ display: 'grid', gap: 18 }}>
          <ArticleSection eyebrow="編輯室觀察" title="本週先讀這段">
            {report.openingNotes.map((note) => (
              <p key={note} style={{ margin: '0 0 10px', fontSize: 16, lineHeight: 1.85, color: 'var(--text-2)' }}>{note}</p>
            ))}
            {report.categorySignals.filter((s) => s.tone !== 'normal').length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                {report.categorySignals
                  .filter((s) => s.tone !== 'normal')
                  .slice(0, 6)
                  .map((s) => (
                    <WeeklyRiskStatus key={s.categoryId} level={s.tone} label={s.category} />
                  ))}
              </div>
            )}
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
                    <div style={{ display: 'grid', gap: 10 }}>
                      {item.story.map((paragraph) => (
                        <p key={paragraph} style={{ margin: 0, fontSize: 15.5, lineHeight: 1.85, color: 'var(--text-2)' }}>{paragraph}</p>
                      ))}
                    </div>
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
                        <span style={{ whiteSpace: 'nowrap', borderRadius: 6, padding: '3px 8px', background: '#F2F4F7', color: '#344054', fontSize: 11, fontWeight: 800 }}>
                          {item.dateLabel
                            .replace(/^新聞時間\s*/, '')
                            .replace(/^PCN\/EOL 時間\s*/, '')
                            .replace(/^報告時間\s*/, '')
                            .replace(/^報告日期\s*/, '')
                            .replace(/^報告日期未標示｜擷取日期\s*/, '擷取 ')}
                        </span>
                      )}
                      <span style={{ whiteSpace: 'nowrap', borderRadius: 6, padding: '3px 8px', background: '#F0FDF4', color: '#0F766E', fontSize: 11, fontWeight: 800 }}>{item.kind}</span>
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
