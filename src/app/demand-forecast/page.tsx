'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Header } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { BENCHMARK_PARTS, DEMAND_CATEGORIES } from '@/lib/demand-forecast/benchmark';

// --- Client-side translation utilities ---
const clientTranslationCache = new Map<string, string>();

function looksLikeEnglish(text: string): boolean {
  if (!text) return false;
  // Count ASCII letter chars vs total length (excluding spaces/punctuation)
  const letters = text.replace(/[^a-zA-Z\u4e00-\u9fff]/g, '');
  if (!letters) return false;
  const asciiLetters = letters.replace(/[^a-zA-Z]/g, '').length;
  return asciiLetters / letters.length > 0.5;
}

async function translateBatchClient(texts: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const toTranslate: string[] = [];

  for (const t of texts) {
    const cleaned = t.trim();
    if (!cleaned) continue;
    if (clientTranslationCache.has(cleaned)) {
      results.set(cleaned, clientTranslationCache.get(cleaned)!);
    } else if (looksLikeEnglish(cleaned)) {
      toTranslate.push(cleaned);
    }
  }

  // Batch translate in chunks of 8 to avoid overly long URLs
  const chunkSize = 8;
  for (let i = 0; i < toTranslate.length; i += chunkSize) {
    const chunk = toTranslate.slice(i, i + chunkSize);
    try {
      // Concatenate with delimiter for batch translation
      const delimiter = '\n\n###SPLIT###\n\n';
      const combined = chunk.join(delimiter);
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-TW&dt=t&q=${encodeURIComponent(combined)}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const translated = (json[0] as any[]).map((item: any) => item[0]).join('');
      // Split back
      const parts = translated.split(/\s*###SPLIT###\s*/);
      for (let j = 0; j < chunk.length; j++) {
        const result = parts[j]?.trim() || chunk[j];
        clientTranslationCache.set(chunk[j], result);
        results.set(chunk[j], result);
      }
    } catch (err) {
      console.error('[CLIENT_TRANSLATOR] Batch failed:', err);
      // Fallback: try one-by-one
      for (const text of chunk) {
        try {
          const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-TW&dt=t&q=${encodeURIComponent(text)}`;
          const resp = await fetch(url);
          if (!resp.ok) continue;
          const json = await resp.json();
          const translated = (json[0] as any[]).map((item: any) => item[0]).join('');
          if (translated) {
            clientTranslationCache.set(text, translated);
            results.set(text, translated);
          }
        } catch { /* skip individual failures */ }
      }
    }
    // Small delay between batches
    if (i + chunkSize < toTranslate.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return results;
}

function useClientTranslatedNews(news: ForecastNews[]): ForecastNews[] {
  const [translated, setTranslated] = useState<ForecastNews[]>(news);

  useEffect(() => {
    if (!news.length) { setTranslated(news); return; }

    // Check if any titles/snippets need client-side translation
    const needsTranslation = news.some(
      (n) => (looksLikeEnglish(n.titleZh || n.title)) || (looksLikeEnglish(n.snippetZh || n.snippet))
    );

    if (!needsTranslation) {
      setTranslated(news);
      return;
    }

    let cancelled = false;

    (async () => {
      // Collect all texts that need translation
      const allTexts: string[] = [];
      for (const n of news) {
        if (looksLikeEnglish(n.titleZh || n.title)) allTexts.push((n.titleZh || n.title).trim());
        if (looksLikeEnglish(n.snippetZh || n.snippet)) allTexts.push((n.snippetZh || n.snippet).trim());
      }

      const unique = [...new Set(allTexts)];
      const translations = await translateBatchClient(unique);

      if (cancelled) return;

      const updated = news.map((n) => {
        const titleKey = (n.titleZh || n.title).trim();
        const snippetKey = (n.snippetZh || n.snippet).trim();
        return {
          ...n,
          titleZh: translations.get(titleKey) || n.titleZh || n.title,
          snippetZh: translations.get(snippetKey) || n.snippetZh || n.snippet,
        };
      });
      setTranslated(updated);
    })();

    return () => { cancelled = true; };
  }, [news]);

  return translated;
}

// --- End client-side translation utilities ---

interface ForecastPart {
  categoryId: string;
  category: string;
  subCategory: string;
  mpn: string;
  manufacturer: string;
  family: string;
  description?: string;
  apiManufacturer?: string;
  supplierCount: number | null;
  totalStock: number | null;
  lowestPriceUsd: number | null;
  maxLeadTimeDays: number | null;
  availabilityStatus?: string;
  productUrl?: string;
  checkedSuppliers?: string[];
  errors?: string[];
  summary: '正常' | '有缺料風險' | '尚未查詢' | '無代理商資料';
  riskReasons?: string[];
}

interface ForecastNews {
  title: string;
  titleZh?: string;
  link: string;
  source: string;
  publishedAt: string;
  snippet: string;
  snippetZh?: string;
  categoryIds: string[];
  riskHit: boolean;
}

interface CategorySummary {
  categoryId: string;
  category: string;
  subCategory: string;
  newsCount: number;
  riskNewsCount: number;
  checkedPartCount?: number;
  riskPartCount?: number;
  totalStock?: number;
  avgSupplierCount?: number;
  maxLeadTimeDays?: number | null;
  summary: '正常' | '有缺料風險';
}

interface ForecastResponse {
  updatedAt: string;
  mode: string;
  news: ForecastNews[];
  lifecycleNews?: ForecastNews[];
  categorySummary: CategorySummary[];
  newsCategorySummary?: CategorySummary[];
  lifecycleCategorySummary?: CategorySummary[];
  parts: ForecastPart[];
}

type PanelTone = 'shortage' | 'lifecycle' | 'api';

const PANEL_TONES: Record<PanelTone, { bg: string; border: string; accent: string; title: string; soft: string; shadow: string }> = {
  shortage: {
    bg: '#FFF7ED',
    border: '#FED7AA',
    accent: '#F97316',
    title: '#9A3412',
    soft: '#FFEDD5',
    shadow: 'rgba(249, 115, 22, 0.12)',
  },
  lifecycle: {
    bg: '#F5F3FF',
    border: '#DDD6FE',
    accent: '#7C3AED',
    title: '#5B21B6',
    soft: '#EDE9FE',
    shadow: 'rgba(124, 58, 237, 0.12)',
  },
  api: {
    bg: '#F0FDF4',
    border: '#BBF7D0',
    accent: '#16A34A',
    title: '#166534',
    soft: '#DCFCE7',
    shadow: 'rgba(22, 163, 74, 0.12)',
  },
};

const CATEGORY_LABELS: Record<string, { zh: string; en: string }> = {
  C01: { zh: '積層陶瓷電容', en: 'MLCC' },
  C02: { zh: '電源管理與穩壓 IC', en: 'PMIC / Regulator' },
  C03: { zh: '功率 MOSFET / 分離式元件', en: 'MOSFET / Power Discrete' },
  C04: { zh: '記憶體 / Flash / DDR', en: 'Memory / Flash / DDR Proxy' },
  C05: { zh: 'MCU / 處理器', en: 'MCU / Processor' },
  C06: { zh: '連接器', en: 'Connector' },
  C07: { zh: '晶體 / 振盪器', en: 'Crystal / Oscillator' },
  C08: { zh: 'TVS / ESD 保護元件', en: 'TVS / ESD / Protection' },
  C09: { zh: '類比 IC / 感測器', en: 'Analog / Sensor' },
  C10: { zh: '介面 IC', en: 'Interface IC' },
  C11: { zh: '電感 / 扼流圈', en: 'Inductor / Choke' },
  C12: { zh: '鋁質 / 固態電容', en: 'Aluminum / Polymer Capacitor' },
  C13: { zh: '光耦 / 數位隔離器', en: 'Optocoupler / Digital Isolator' },
  C14: { zh: '乙太網路 / 網通 IC', en: 'Ethernet / Networking IC' },
  C15: { zh: '散熱 / 風扇 / 電源模組', en: 'Thermal / Fan / Power Module' },
};

function categoryName(categoryId: string, fallback: string) {
  const label = CATEGORY_LABELS[categoryId];
  return label ? `${label.zh}（${label.en}）` : fallback;
}

function categoryTitle(categoryId: string, fallback: string) {
  return CATEGORY_LABELS[categoryId]?.zh ?? fallback;
}

function categorySubtitle(categoryId: string, fallback: string) {
  return CATEGORY_LABELS[categoryId]?.en ?? fallback;
}

function categoryNumber(categoryId: string) {
  const match = categoryId.match(/\d+/);
  return match ? match[0].padStart(2, '0') : categoryId;
}

function newsDateValue(item: ForecastNews) {
  const time = Date.parse(item.publishedAt);
  return Number.isFinite(time) ? time : 0;
}

function formatNewsDate(item: ForecastNews) {
  const time = newsDateValue(item);
  if (!time) return '時間未提供';
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(time));
}

function riskNewsTimeText(items: ForecastNews[]) {
  const riskItems = items.filter((item) => item.riskHit).sort((a, b) => newsDateValue(a) - newsDateValue(b));
  if (riskItems.length === 0) return '無缺料新聞時間';
  if (riskItems.length === 1) return formatNewsDate(riskItems[0]);
  if (riskItems.length <= 4) return riskItems.map(formatNewsDate).join('、');
  return `${formatNewsDate(riskItems[0])} - ${formatNewsDate(riskItems[riskItems.length - 1])}`;
}

export default function DemandForecastPage() {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('');
  const [mode, setMode] = useState<'summary' | 'full'>('summary');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [health, setHealth] = useState({ live: 0, total: 1 });

  async function loadForecast(nextMode: 'summary' | 'full') {
    setLoading(true);
    setLoadingLabel(nextMode === 'summary' ? '正在更新產業新聞' : '正在查詢 150 顆料件');
    setError('');
    setMode(nextMode);
    try {
      const resp = await fetch(`/api/demand-forecast?mode=${nextMode}`, { cache: 'no-store' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setData(await resp.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : '缺料預測更新失敗');
    } finally {
      setLoading(false);
      setLoadingLabel('');
    }
  }

  useEffect(() => {
    loadForecast('summary');
    fetch('/api/health')
      .then((resp) => resp.json())
      .then((json) => setHealth({ live: json.liveSourceCount ?? 0, total: json.totalSourceCount ?? 1 }))
      .catch(() => setHealth({ live: 0, total: 1 }));
  }, []);

  const fallbackParts: ForecastPart[] = BENCHMARK_PARTS.map((part) => ({
    ...part,
    description: '',
    apiManufacturer: '',
    supplierCount: null,
    totalStock: null,
    lowestPriceUsd: null,
    maxLeadTimeDays: null,
    availabilityStatus: '',
    productUrl: '',
    checkedSuppliers: [],
    errors: [],
    summary: '尚未查詢' as const,
    riskReasons: [],
  }));
  const parts: ForecastPart[] = useMemo(() => {
    const rawParts = data?.parts ?? fallbackParts;
    return rawParts.map(p => {
      if (p.supplierCount === null || p.supplierCount === undefined) {
        return { ...p, summary: '尚未查詢' as const };
      }
      if (p.supplierCount === 0) {
        return { ...p, summary: '無代理商資料' as const };
      }
      return p as ForecastPart;
    });
  }, [data?.parts, fallbackParts]);

  const filteredParts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return parts.filter((part) => {
      const categoryOk = category === 'all' || part.categoryId === category;
      const queryOk = !normalized || [part.mpn, part.manufacturer, part.category, categoryName(part.categoryId, part.category), part.family, part.description ?? '']
        .join(' ')
        .toLowerCase()
        .includes(normalized);
      return categoryOk && queryOk;
    });
  }, [parts, category, query]);

  const riskParts = parts.filter((part) => part.summary === '有缺料風險').length;
  const shortageCategorySummary: CategorySummary[] = data?.newsCategorySummary ?? DEMAND_CATEGORIES.map((cat) => ({
    ...cat,
    newsCount: 0,
    riskNewsCount: 0,
    summary: '正常' as const,
  }));
  const riskCategories = shortageCategorySummary.filter((item) => item.summary === '有缺料風險').length;
  const lifecycleCategorySummary: CategorySummary[] = data?.lifecycleCategorySummary ?? DEMAND_CATEGORIES.map((cat) => ({
    ...cat,
    newsCount: 0,
    riskNewsCount: 0,
    summary: '正常' as const,
  }));
  const shortageNewsCount = (data?.news ?? []).filter((item) => item.riskHit).length;
  const lifecycleNewsCount = (data?.lifecycleNews ?? []).filter((item) => item.riskHit).length;
  const updatedAt = data?.updatedAt ? new Date(data.updatedAt).toLocaleString() : '尚未更新';
  const newsByCategory = useMemo(() => {
    const map = new Map<string, ForecastNews[]>();
    for (const item of data?.news ?? []) {
      for (const categoryId of item.categoryIds) {
        map.set(categoryId, [...(map.get(categoryId) ?? []), item]);
      }
    }
    return map;
  }, [data?.news]);
  const lifecycleByCategory = useMemo(() => {
    const map = new Map<string, ForecastNews[]>();
    for (const item of data?.lifecycleNews ?? []) {
      for (const categoryId of item.categoryIds) {
        map.set(categoryId, [...(map.get(categoryId) ?? []), item]);
      }
    }
    return map;
  }, [data?.lifecycleNews]);
  const displayNews = useMemo(() => {
    const riskNews = (data?.news ?? []).filter((item) => item.riskHit);
    if (category === 'all') return riskNews;
    return riskNews.filter((item) => item.categoryIds.includes(category));
  }, [data?.news, category]);
  const displayLifecycleNews = useMemo(() => {
    const riskNews = (data?.lifecycleNews ?? []).filter((item) => item.riskHit);
    if (category === 'all') return riskNews;
    return riskNews.filter((item) => item.categoryIds.includes(category));
  }, [data?.lifecycleNews, category]);

  // Client-side translation: translate any remaining English titles/snippets
  const translatedDisplayNews = useClientTranslatedNews(displayNews);
  const translatedDisplayLifecycleNews = useClientTranslatedNews(displayLifecycleNews);

  const selectedCategoryLabel = category === 'all'
    ? '全部類別'
    : categoryName(category, DEMAND_CATEGORIES.find((item) => item.categoryId === category)?.category ?? category);

  return (
    <div>
      <Header apiOnline={health.live > 0} liveSourceCount={health.live} totalSourceCount={health.total} />

      <main style={{ maxWidth: 1440, margin: '0 auto', padding: '34px 24px 56px', width: '100%' }}>
        <section style={{ display: 'flex', justifyContent: 'space-between', gap: 24, alignItems: 'flex-start', marginBottom: 22 }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--primary-2)', fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
              <Icon name="trend" size={14} /> 缺料預測雷達
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.02em', color: 'var(--text)' }}>缺料預測</h1>
            <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 14, lineHeight: 1.7, maxWidth: 760 }}>
              用 RSS 產業新聞判斷目前可能缺料的類別，再用 15 個類別 × 每類 10 顆基準料號查詢供應商資料，輸出每顆料的基本資料與總結。
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn" disabled={loading} onClick={() => loadForecast('summary')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="globe" size={14} /> {loading && mode === 'summary' ? '處理中，請耐心等待' : '更新產業新聞'}
            </button>
            <button className="btn-primary" disabled={loading} onClick={() => loadForecast('full')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="zap" size={14} /> {loading && mode === 'full' ? '處理中，請耐心等待' : '查詢 150 顆料件'}
            </button>
          </div>
        </section>

        {error && (
          <div style={{ border: '1px solid #F5C2C7', background: '#FFF5F5', color: '#B42318', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
          <Metric label="資料模式" value={mode === 'full' ? '新聞 + 供應商資料' : '新聞'} />
          <Metric label="缺料新聞" value={`${shortageNewsCount}`} />
          <Metric label="生命週期訊號" value={`${lifecycleNewsCount}`} tone={lifecycleNewsCount > 0 ? 'risk' : 'normal'} />
          <Metric label="新聞風險類別" value={`${riskCategories} / ${DEMAND_CATEGORIES.length}`} tone={riskCategories > 0 ? 'risk' : 'normal'} />
          <Metric label="風險料件" value={`${riskParts} / ${parts.length}`} tone={riskParts > 0 ? 'risk' : 'normal'} />
        </section>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18, color: 'var(--text-3)', fontSize: 12 }}>
          <span>更新時間：{updatedAt}</span>
          {loading && <span className="mono">處理中，請耐心等待：{loadingLabel}</span>}
        </div>

        <section style={{ marginBottom: 20 }}>
          <Panel title="缺料預測風險對照矩陣" tone="api">
            <p style={{ margin: '0 0 14px 0', fontSize: 13, color: 'var(--text-3)' }}>
              整合三種預警偵測管道（RSS 新聞、原廠生命週期公告、實時通路代理商庫存），橫向比對 15 個關鍵料件類別的缺料風險狀況：
            </p>
            <div style={{ overflow: 'auto', border: '1px solid var(--hairline)', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 800 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap', width: '30%' }}>料件類別</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, width: '23%' }}>
                      <div>RSS 新聞監測</div>
                      <div style={{ fontWeight: 400, fontSize: 10, color: 'var(--text-3)', marginTop: 3, whiteSpace: 'normal', lineHeight: 1.4 }}>
                        含 shortage / allocation / lead time 等關鍵字 → 風險
                      </div>
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, width: '23%' }}>
                      <div>生命週期公告 (PCN/EOL)</div>
                      <div style={{ fontWeight: 400, fontSize: 10, color: 'var(--text-3)', marginTop: 3, whiteSpace: 'normal', lineHeight: 1.4 }}>
                        含 PCN / EOL / NRND / 停產 等關鍵字 → 風險
                      </div>
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, width: '24%' }}>
                      <div>實時通路庫存 (API)</div>
                      <div style={{ fontWeight: 400, fontSize: 10, color: 'var(--text-3)', marginTop: 3, whiteSpace: 'normal', lineHeight: 1.4 }}>
                        料件：庫存=0 或 交期≥12週且庫存&lt;5K<br />
                        類別：風險料≥3 或 已查≥5且風險佔比≥40%
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {DEMAND_CATEGORIES.map((cat) => {
                    const newsRisk = shortageCategorySummary.find((s) => s.categoryId === cat.categoryId)?.summary === '有缺料風險';
                    const lifecycleRisk = lifecycleCategorySummary.find((s) => s.categoryId === cat.categoryId)?.summary === '有缺料風險';
                    const apiRisk = data?.categorySummary?.find((s) => s.categoryId === cat.categoryId)?.summary === '有缺料風險';
                    
                    // For API risk, if checkedPartCount is 0 or undefined, it means not queried yet
                    const hasApiCheck = data?.categorySummary && (data.categorySummary.find((s) => s.categoryId === cat.categoryId)?.checkedPartCount ?? 0) > 0;
                    
                    return (
                      <tr key={cat.categoryId} style={{ borderTop: '1px solid var(--hairline)', background: '#fff' }}>
                        <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 5, background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 10, fontWeight: 800 }}>
                            {categoryNumber(cat.categoryId)}
                          </span>
                          <span>{categoryName(cat.categoryId, cat.category)}</span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', verticalAlign: 'middle' }}>
                          <RiskCellBadge hasRisk={newsRisk} />
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', verticalAlign: 'middle' }}>
                          <RiskCellBadge hasRisk={lifecycleRisk} label="有異動風險" />
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', verticalAlign: 'middle' }}>
                          {hasApiCheck ? (
                            <RiskCellBadge hasRisk={apiRisk} />
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '3px 8px', fontSize: 11, fontWeight: 700, background: '#F2F4F7', color: '#344054' }}>
                              尚未查詢
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(420px, 0.85fr) minmax(0, 1fr)', gap: 16, marginBottom: 18, alignItems: 'start' }}>
          <CategoryRiskPanel
            title="RSS 新聞風險總覽"
            tone="shortage"
            items={shortageCategorySummary}
            category={category}
            onSelect={setCategory}
            relatedByCategory={newsByCategory}
            countLabel="新聞"
            riskLabel="缺料新聞"
            timeLabel="缺料新聞時間"
          />
          <NewsPanel
            title={`RSS 缺料新聞：${selectedCategoryLabel}`}
            tone="shortage"
            items={translatedDisplayNews}
            emptyText={category === 'all' ? '目前沒有缺料相關新聞。' : '此類別無缺料相關新聞。'}
            badge="缺料訊號"
          />
          <CategoryRiskPanel
            title="生命週期風險總覽"
            tone="lifecycle"
            items={lifecycleCategorySummary}
            category={category}
            onSelect={setCategory}
            relatedByCategory={lifecycleByCategory}
            countLabel="公告新聞"
            riskLabel="PCN / EOL / NRND"
            timeLabel="生命週期訊號時間"
          />
          <NewsPanel
            title={`生命週期風險：${selectedCategoryLabel}`}
            tone="lifecycle"
            items={translatedDisplayLifecycleNews}
            emptyText={category === 'all' ? '目前沒有抓到 PCN / EOL / NRND 訊號。' : '這個類別目前沒有對應的 PCN / EOL / NRND 訊號。'}
            badge="PCN / EOL"
          />
        </section>

        <Panel title="15 個類別 × 每類 10 顆料件查詢" tone="api">
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ height: 36, border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', background: '#fff', color: 'var(--text)', fontSize: 13 }}>
              <option value="all">全部類別</option>
              {DEMAND_CATEGORIES.map((item) => <option key={item.categoryId} value={item.categoryId}>{categoryName(item.categoryId, item.category)}</option>)}
            </select>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋料號 / 廠商 / 類別…" style={{ height: 36, flex: '1 1 260px', border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', fontSize: 13 }} />
            <button className="btn" onClick={() => { setCategory('all'); setQuery(''); }}>清除</button>
          </div>

          <div style={{ overflow: 'auto', border: '1px solid var(--hairline)', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 1180 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
                  <Th>類別</Th>
                  <Th>料號</Th>
                  <Th>廠商</Th>
                  <Th>基本資料</Th>
                  <Th align="right">供應商</Th>
                  <Th align="right">總庫存</Th>
                  <Th align="right">最低價</Th>
                  <Th align="right">最長交期</Th>
                  <Th>總結</Th>
                </tr>
              </thead>
              <tbody>
                {filteredParts.map((part) => (
                  <tr key={`${part.categoryId}-${part.mpn}`} style={{ borderTop: '1px solid var(--hairline)' }}>
                    <Td>{categoryName(part.categoryId, part.category)}</Td>
                    <Td mono>{part.mpn}</Td>
                    <Td>{part.apiManufacturer || part.manufacturer}</Td>
                    <Td>
                      <div style={{ color: 'var(--text)' }}>{part.description || part.family}</div>
                      <div style={{ color: 'var(--text-3)', marginTop: 2 }}>{part.subCategory}</div>
                    </Td>
                    <Td align="right">{part.supplierCount ?? '-'}</Td>
                    <Td align="right">{part.totalStock === null ? '-' : part.totalStock.toLocaleString()}</Td>
                    <Td align="right">{part.lowestPriceUsd === null ? '-' : `$${part.lowestPriceUsd.toFixed(4)}`}</Td>
                    <Td align="right">{part.maxLeadTimeDays === null ? '-' : `${Math.round(part.maxLeadTimeDays / 7)} 週`}</Td>
                    <Td>
                      <RiskBadge value={part.summary} />
                      {!!part.riskReasons?.length && (
                        <div style={{ color: 'var(--text-3)', marginTop: 4, lineHeight: 1.4 }}>{part.riskReasons.join(' / ')}</div>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </main>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'normal' | 'risk' }) {
  return (
    <div style={{ border: '1px solid var(--hairline)', borderRadius: 8, padding: '14px 16px', background: '#fff' }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: tone === 'risk' ? '#B42318' : 'var(--text)' }}>{value}</div>
    </div>
  );
}

function Panel({ title, children, tone }: { title: string; children: ReactNode; tone?: PanelTone }) {
  const toneStyle = tone ? PANEL_TONES[tone] : null;
  return (
    <section
      style={{
        border: toneStyle ? `1px solid ${toneStyle.border}` : '1px solid var(--hairline)',
        borderLeft: toneStyle ? `4px solid ${toneStyle.accent}` : '1px solid var(--hairline)',
        borderRadius: 8,
        background: toneStyle?.bg ?? '#fff',
        padding: 16,
      }}
    >
      <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: toneStyle?.title ?? 'var(--text)' }}>{title}</h2>
      {children}
    </section>
  );
}

function CategoryRiskPanel({
  title,
  tone,
  items,
  category,
  onSelect,
  relatedByCategory,
  countLabel,
  riskLabel,
  timeLabel,
}: {
  title: string;
  tone: PanelTone;
  items: CategorySummary[];
  category: string;
  onSelect: (categoryId: string) => void;
  relatedByCategory: Map<string, ForecastNews[]>;
  countLabel: string;
  riskLabel: string;
  timeLabel: string;
}) {
  const toneStyle = PANEL_TONES[tone];
  return (
    <Panel title={title} tone={tone}>
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map((item) => {
          const relatedNews = relatedByCategory.get(item.categoryId) ?? [];
          const selected = category === item.categoryId;
          return (
            <button
              key={item.categoryId}
              onClick={() => onSelect(item.categoryId)}
              style={{
                textAlign: 'left',
                border: selected ? `1px solid ${toneStyle.accent}` : `1px solid ${toneStyle.border}`,
                borderLeft: selected ? `4px solid ${toneStyle.accent}` : '4px solid transparent',
                borderRadius: 8,
                background: selected ? toneStyle.soft : '#fff',
                padding: '10px 12px',
                cursor: 'pointer',
                boxShadow: selected ? `0 8px 22px ${toneStyle.shadow}` : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr)', gap: 8, alignItems: 'start' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, background: selected ? '#fff' : 'var(--surface-2)', color: selected ? toneStyle.title : 'var(--text-2)', fontSize: 11, fontWeight: 800 }}>
                    {categoryNumber(item.categoryId)}
                  </span>
                  <div>
                    <strong style={{ fontSize: 13, display: 'block' }}>{categoryTitle(item.categoryId, item.category)}</strong>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginTop: 2 }}>{categorySubtitle(item.categoryId, item.category)}</span>
                  </div>
                </div>
                <RiskBadge value={item.summary} />
              </div>
              <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text-3)' }}>
                {countLabel} {item.newsCount} 則 · {riskLabel} {item.riskNewsCount} 則
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: item.riskNewsCount > 0 ? '#B42318' : 'var(--text-3)', lineHeight: 1.4 }}>
                {timeLabel}：{riskNewsTimeText(relatedNews)}
              </div>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function NewsPanel({ title, tone, items, emptyText, badge }: { title: string; tone: PanelTone; items: ForecastNews[]; emptyText: string; badge: string }) {
  const toneStyle = PANEL_TONES[tone];
  return (
    <Panel title={title} tone={tone}>
      <div style={{ display: 'grid', gap: 8 }}>
        {items.slice(0, 18).map((item, idx) => (
          <div key={`${item.link}-${idx}`} style={{ border: `1px solid ${toneStyle.border}`, borderRadius: 8, padding: '10px 12px', background: '#fff' }}>
            <a href={`https://translate.google.com/translate?sl=auto&tl=zh-TW&u=${encodeURIComponent(item.link)}`} target="_blank" rel="noreferrer" title="開啟中文翻譯新聞" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
                <strong style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.35 }}>{item.titleZh || item.title}</strong>
                <span style={{ whiteSpace: 'nowrap', fontSize: 11, color: toneStyle.title, background: toneStyle.soft, borderRadius: 999, padding: '2px 7px', fontWeight: 700 }}>{badge}</span>
              </div>
            </a>
            {item.snippetZh && item.snippetZh !== item.titleZh && (
              <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 6 }}>
                {item.snippetZh}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--text-3)' }}>
              <span>{item.source} · 新聞時間 {formatNewsDate(item)}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
                <a href={item.link} target="_blank" rel="noreferrer" style={{ color: 'var(--text-3)', textDecoration: 'none', fontWeight: 600 }}>
                  原文
                </a>
              </span>
            </div>
          </div>
        ))}
        {!items.length && <EmptyLine text={emptyText} />}
      </div>
    </Panel>
  );
}

function RiskBadge({ value }: { value: '正常' | '有缺料風險' | '尚未查詢' | '無代理商資料' }) {
  if (value === '尚未查詢') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '3px 8px', fontSize: 11, fontWeight: 700, background: '#F2F4F7', color: '#344054' }}>
        尚未查詢
      </span>
    );
  }
  if (value === '無代理商資料') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '3px 8px', fontSize: 11, fontWeight: 700, background: '#F8F9FA', color: '#475467', border: '1px solid #E4E7EC' }}>
        無代理商資料
      </span>
    );
  }
  const risk = value === '有缺料風險';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '3px 8px', fontSize: 11, fontWeight: 700, background: risk ? '#FFF1F0' : '#ECFDF3', color: risk ? '#B42318' : '#027A48' }}>
      {value}
    </span>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 14, color: 'var(--text-3)', fontSize: 13 }}>{text}</div>;
}

function Th({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
  return <th style={{ padding: '10px 12px', textAlign: align, fontWeight: 700, whiteSpace: 'nowrap' }}>{children}</th>;
}

function Td({ children, align = 'left', mono = false }: { children: ReactNode; align?: 'left' | 'right'; mono?: boolean }) {
  return <td style={{ padding: '10px 12px', textAlign: align, verticalAlign: 'top', fontFamily: mono ? 'var(--font-mono)' : undefined }}>{children}</td>;
}

function RiskCellBadge({ hasRisk, label = '有缺料風險' }: { hasRisk: boolean; label?: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        borderRadius: 999,
        padding: '3px 8px',
        fontSize: 11,
        fontWeight: 700,
        background: hasRisk ? '#FFF1F0' : '#ECFDF3',
        color: hasRisk ? '#B42318' : '#027A48',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: hasRisk ? '#D92D20' : '#12B76A' }}></span>
      {hasRisk ? label : '正常'}
    </span>
  );
}
