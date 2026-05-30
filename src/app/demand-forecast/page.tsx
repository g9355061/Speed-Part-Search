'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { Header } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { BENCHMARK_PARTS, DEMAND_CATEGORIES, CATEGORY_THRESHOLDS } from '@/lib/demand-forecast/benchmark';

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
  const [translated, setTranslated] = useState<ForecastNews[]>([]);
  const [sourceRef, setSourceRef] = useState<ForecastNews[]>([]);

  // Always sync with upstream news first
  useEffect(() => {
    if (!news.length) { setTranslated([]); setSourceRef([]); return; }

    // If news reference changed, reset to show the raw news immediately
    setTranslated(news);
    setSourceRef(news);

    // Check if any titles/snippets need client-side translation
    const needsTranslation = news.some(
      (n) => (looksLikeEnglish(n.titleZh || n.title)) || (looksLikeEnglish(n.snippetZh || n.snippet))
    );

    if (!needsTranslation) return;

    let cancelled = false;

    (async () => {
      try {
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
      } catch (err) {
        console.error('[CLIENT_TRANSLATOR] Translation failed, keeping original:', err);
        // On error, keep original news - already set above
      }
    })();

    return () => { cancelled = true; };
  }, [news]);

  // If translated is empty but news has data, always fallback to news
  return translated.length > 0 ? translated : news;
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
  minLeadTimeDays?: number | null;
  availabilityStatus?: string;
  productUrl?: string;
  checkedSuppliers?: string[];
  errors?: string[];
  summary: '正常' | '有缺料風險' | '尚未查詢' | '無代理商資料' | '中風險';
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
  summary: '正常' | '有缺料風險' | '中風險';
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
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';

  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('');
  const [mode, setMode] = useState<'cached' | 'summary' | 'full'>('cached');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [health, setHealth] = useState({ live: 0, total: 1 });

  const [showThresholdsModal, setShowThresholdsModal] = useState(false);
  const [thresholds, setThresholds] = useState<Record<string, { minStock: number; lowStock: number }>>(CATEGORY_THRESHOLDS);
  const [editingThresholds, setEditingThresholds] = useState<Record<string, { minStock: number; lowStock: number }> | null>(null);
  const [savingThresholds, setSavingThresholds] = useState(false);
  const [thresholdsError, setThresholdsError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [marketReports, setMarketReports] = useState<any[]>([]);
  const [loadingMarketReports, setLoadingMarketReports] = useState(false);

  const handleMatrixClick = (categoryId: string, targetId: string) => {
    setCategory(categoryId);
    setTimeout(() => {
      const element = document.getElementById(targetId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  };

  async function loadForecast(nextMode: 'cached' | 'summary' | 'full') {
    setLoading(nextMode !== 'cached');
    if (nextMode !== 'cached') setLoadingLabel(nextMode === 'summary' ? '正在更新產業新聞' : '正在查詢 150 顆料件');
    setError('');
    setMode(nextMode);
    try {
      const resp = await fetch(`/api/demand-forecast?mode=${nextMode}`, { cache: 'no-store' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const result = await resp.json();
      setData(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : '缺料預測更新失敗');
      return null;
    } finally {
      setLoading(false);
      setLoadingLabel('');
    }
  }

  async function loadThresholds() {
    try {
      const resp = await fetch('/api/demand-forecast/thresholds');
      if (resp.ok) {
        const json = await resp.json();
        if (json.thresholds) {
          setThresholds(json.thresholds);
        }
      }
    } catch (err) {
      console.error('Failed to load thresholds:', err);
    }
  }

  useEffect(() => {
    (async () => {
      // 1. Try cached data first (instant)
      const cached = await loadForecast('cached');
      // 2. If no news in cache, auto-fetch fresh news
      const hasNews = cached?.news?.length > 0 || cached?.lifecycleNews?.length > 0;
      if (!hasNews) {
        await loadForecast('summary');
      }
    })();
    loadThresholds();
    
    // 載入市場報告 (產業情報)
    setLoadingMarketReports(true);
    fetch('/api/demand-forecast/market-reports')
      .then((r) => r.json())
      .then((json) => {
        if (json.reports) {
          setMarketReports(json.reports);
        }
      })
      .catch((err) => console.error('Failed to load market reports:', err))
      .finally(() => setLoadingMarketReports(false));

    fetch('/api/health')
      .then((resp) => resp.json())
      .then((json) => setHealth({ live: json.liveSourceCount ?? 0, total: json.totalSourceCount ?? 1 }))
      .catch(() => setHealth({ live: 0, total: 1 }));
  }, []);

  const categoryMarketRisk = useMemo(() => {
    const result: Record<string, '正常' | '中風險' | '有缺料風險'> = {};
    for (const cat of DEMAND_CATEGORIES) {
      result[cat.categoryId] = '正常';
    }
    const catReportMap: Record<string, any[]> = {};
    for (const rep of marketReports) {
      for (const catId of rep.categoryIds) {
        if (!catReportMap[catId]) catReportMap[catId] = [];
        catReportMap[catId].push(rep);
      }
    }
    for (const [catId, reps] of Object.entries(catReportMap)) {
      const activeAlerts = reps.filter(r => r.riskLevel !== '正常');
      if (activeAlerts.length === 0) continue;
      
      const uniqueSources = new Set(activeAlerts.map(r => r.source));
      
      if (uniqueSources.size >= 2) {
        result[catId] = 'haveRisk' as any === 'high' ? '有缺料風險' : '有缺料風險'; // 確保為 string
      } else if (uniqueSources.size === 1) {
        result[catId] = '中風險';
      } else {
        result[catId] = '正常';
      }
    }
    return result;
  }, [marketReports]);

  const fallbackParts: ForecastPart[] = BENCHMARK_PARTS.map((part) => ({
    ...part,
    description: '',
    apiManufacturer: '',
    supplierCount: null,
    totalStock: null,
    lowestPriceUsd: null,
    maxLeadTimeDays: null,
    minLeadTimeDays: null,
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
          <Metric label="資料模式" value={mode === 'full' ? '新聞 + 供應商資料' : mode === 'cached' ? '快取資料' : '新聞'} />
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
            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 12, background: 'var(--surface-2)', padding: '12px 16px', borderRadius: 8, marginBottom: 14, fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5, border: '1px solid var(--border)' }}>
              <div>
                <strong>💡 庫存優先於交期原則：</strong>現貨庫存大於等於類別「補貨水位」時，完全忽略交期，視為「正常」綠標。補貨交期改用各授權分銷商中的「最短交期」（而非最長），避免因單一代理商交期拉長導致誤判。
                <div style={{ marginTop: 8 }}>
                  <strong>📈 歷史趨勢警告規則（對比 7 天前歷史點）：</strong>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                    <li>🔴 庫存 7 天內暴跌 &gt; 80%</li>
                    <li>🟡 庫存 7 天內下降 &gt; 50% / 授權分銷商數自 &gt;=3 家減至 1 家</li>
                    <li>🟡 最低報價上漲 &gt; 30% / 補貨最短交期增加 &gt; 8 週</li>
                  </ul>
                </div>
              </div>
              <div>
                <strong>⚠️ 水位定義與警示說明：</strong>
                <ul style={{ margin: '4px 0 0', paddingLeft: 16, listStyleType: 'disc' }}>
                  <li style={{ marginBottom: 4 }}>
                    <strong style={{ borderBottom: '1px dashed var(--text-3)', cursor: 'help' }} title="維持生產不中斷的底線庫存。一旦跌破，代表安全緩衝已遭消耗，系統會直接觸發中風險 (🟡) 警示，此時交期長短將被忽略。">
                      安全水位 (Safety Stock)
                    </strong>：維持生產營運不中斷的**底線防禦庫存**。低於此水位直接觸發 🟡 中風險 警示（忽略交期長短）。
                  </li>
                  <li>
                    <strong style={{ borderBottom: '1px dashed var(--text-3)', cursor: 'help' }} title="啟動採購補貨流程的預警庫存線。當庫存低於此水位但高於安全水位時，僅在最短補貨交期拉長（>= 12週觸發 🟡，>= 20週觸發 🔴）時才會警示；若交期短於 12 週仍視為安全 (🟢)。">
                      補貨水位 (Reorder Point)
                    </strong>：啟動採購補貨的**預警庫存界線**。低於此水位且最短補貨交期拉長（&gt;= 12週觸發 🟡，&gt;= 20週觸發 🔴）時觸發警示。
                  </li>
                </ul>
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--primary)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    textDecoration: 'underline'
                  }}
                  onClick={() => {
                    setEditingThresholds(JSON.parse(JSON.stringify(thresholds)));
                    setThresholdsError(null);
                    setIsEditing(false);
                    setShowThresholdsModal(true);
                  }}
                >
                  ▼ 🔍 點此查看 15 個類別的「安全水位 / 補貨水位」具體數值
                </div>
              </div>
            </div>
            <div style={{ overflow: 'auto', border: '1px solid var(--hairline)', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 1000 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap', width: '24%' }}>料件類別與安全/補貨門檻</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, width: '19%' }}>
                      <div>市場報告 / 產業情報</div>
                      <div style={{ fontWeight: 400, fontSize: 10, color: 'var(--text-3)', marginTop: 3, whiteSpace: 'normal', lineHeight: 1.4 }}>
                        抓取免費公開市場報告，對應 15 類別生成缺料風險
                      </div>
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, width: '19%' }}>
                      <div>RSS 新聞監測</div>
                      <div style={{ fontWeight: 400, fontSize: 10, color: 'var(--text-3)', marginTop: 3, whiteSpace: 'normal', lineHeight: 1.4 }}>
                        14 天內 ≥2 則含缺料關鍵字新聞 → 風險
                      </div>
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, width: '19%' }}>
                      <div>生命週期公告 (PCN/EOL)</div>
                      <div style={{ fontWeight: 400, fontSize: 10, color: 'var(--text-3)', marginTop: 3, whiteSpace: 'normal', lineHeight: 1.4 }}>
                        14 天內 ≥2 則含 EOL/PCN/停產關鍵字 → 風險
                      </div>
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, width: '19%' }}>
                      <div>實時通路庫存 (API)</div>
                      <div style={{ fontWeight: 400, fontSize: 10, color: 'var(--text-3)', marginTop: 3, whiteSpace: 'normal', lineHeight: 1.4 }}>
                        🔴 庫存=0、(庫存 &lt; 補貨水位 且 最短交期 &gt;= 20週) 或 7天庫存暴跌 &gt; 80%<br />
                        🟡 庫存 &lt; 安全水位、交期 &gt;= 12週 或觸發 7天趨勢警示 (量/價/交期/供應商)
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {DEMAND_CATEGORIES.map((cat) => {
                    const newsSum = shortageCategorySummary.find((s) => s.categoryId === cat.categoryId);
                    const lifecycleSum = lifecycleCategorySummary.find((s) => s.categoryId === cat.categoryId);
                    const apiSum = data?.categorySummary?.find((s) => s.categoryId === cat.categoryId);
                    const newsRisk = newsSum?.summary === '有缺料風險';
                    const lifecycleRisk = lifecycleSum?.summary === '有缺料風險';
                    const apiSummary: string = apiSum?.summary ?? '正常';
                    const hasApiCheck = apiSum && (apiSum.checkedPartCount ?? 0) > 0;
                    const catThresholds = thresholds[cat.categoryId] || { minStock: 1000, lowStock: 5000 };
                    
                    // Determine API risk level for 3-color badge
                    const apiRiskLevel: 'high' | 'medium' | 'none' = apiSummary === '有缺料風險' ? 'high' : apiSummary === '中風險' ? 'medium' : 'none';
                    
                    // Determine Market Risk level
                    const marketRisk = categoryMarketRisk[cat.categoryId] || '正常';
                    const marketRiskLevel: 'high' | 'medium' | 'none' = marketRisk === '有缺料風險' ? 'high' : marketRisk === '中風險' ? 'medium' : 'none';
                    
                    return (
                      <tr key={cat.categoryId} style={{ borderTop: '1px solid var(--hairline)', background: '#fff' }}>
                        <td
                          className="matrix-cell-interactive"
                          title="點擊跳轉查看該類別的風險總覽"
                          onClick={() => handleMatrixClick(cat.categoryId, 'shortage-category-panel')}
                          style={{ padding: '10px 12px', verticalAlign: 'middle', fontWeight: 600 }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 5, background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 10, fontWeight: 800 }}>
                              {categoryNumber(cat.categoryId)}
                            </span>
                            <span>{categoryName(cat.categoryId, cat.category)}</span>
                          </div>
                          <div style={{ fontWeight: 400, fontSize: 10, color: 'var(--text-3)', marginTop: 4, marginLeft: 30 }}>
                            <span style={{ cursor: 'help', borderBottom: '1px dashed #bbb' }} title="安全水位 (Safety Stock)：維持生產不中斷的底線緩衝庫存。低於此數值會直接觸發中風險 (🟡)。">安全水位</span>: <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>{catThresholds.minStock.toLocaleString()}</span> |{' '}
                            <span style={{ cursor: 'help', borderBottom: '1px dashed #bbb' }} title="補貨水位 (Reorder Point)：啟動採購補貨流程的預警庫存線。介於補貨與安全水位之間時，僅在補貨交期拉長時觸發警示。">補貨水位</span>: <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>{catThresholds.lowStock.toLocaleString()}</span> 顆
                          </div>
                        </td>
                        <td
                          className="matrix-cell-interactive"
                          title="點擊跳轉查看該類別的市場情報報告"
                          onClick={() => handleMatrixClick(cat.categoryId, 'market-reports-panel')}
                          style={{ padding: '10px 12px', textAlign: 'center', verticalAlign: 'middle' }}
                        >
                          <RiskCellBadge level={marketRiskLevel} />
                        </td>
                        <td
                          className="matrix-cell-interactive"
                          title="點擊跳轉查看該類別的缺料新聞"
                          onClick={() => handleMatrixClick(cat.categoryId, 'shortage-news-panel')}
                          style={{ padding: '10px 12px', textAlign: 'center', verticalAlign: 'middle' }}
                        >
                          <RiskCellBadge level={newsRisk ? 'high' : 'none'} />
                        </td>
                        <td
                          className="matrix-cell-interactive"
                          title="點擊跳轉查看該類別的生命週期公告"
                          onClick={() => handleMatrixClick(cat.categoryId, 'lifecycle-news-panel')}
                          style={{ padding: '10px 12px', textAlign: 'center', verticalAlign: 'middle' }}
                        >
                          <RiskCellBadge level={lifecycleRisk ? 'high' : 'none'} highLabel="有異動風險" />
                        </td>
                        <td
                          className="matrix-cell-interactive"
                          title="點擊跳轉查看該類別的實時通路庫存"
                          onClick={() => handleMatrixClick(cat.categoryId, 'api-parts-panel')}
                          style={{ padding: '10px 12px', textAlign: 'center', verticalAlign: 'middle' }}
                        >
                          {hasApiCheck ? (
                            <RiskCellBadge level={apiRiskLevel} />
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
            id="shortage-category-panel"
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
            id="shortage-news-panel"
            title={`RSS 缺料新聞：${selectedCategoryLabel}`}
            tone="shortage"
            items={translatedDisplayNews}
            emptyText={category === 'all' ? '目前沒有缺料相關新聞。' : '此類別無缺料相關新聞。'}
            badge="缺料訊號"
          />
          <CategoryRiskPanel
            id="lifecycle-category-panel"
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
            id="lifecycle-news-panel"
            title={`生命週期風險：${selectedCategoryLabel}`}
            tone="lifecycle"
            items={translatedDisplayLifecycleNews}
            emptyText={category === 'all' ? '目前沒有抓到 PCN / EOL / NRND 訊號。' : '這個類別目前沒有對應的 PCN / EOL / NRND 訊號。'}
            badge="PCN / EOL"
          />
        </section>

        <MarketReportsPanel
          id="market-reports-panel"
          category={category}
          reports={marketReports}
          onSelectCategory={setCategory}
        />

        <Panel id="api-parts-panel" title="15 個類別 × 每類 10 顆料件查詢" tone="api">
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
                  <Th align="right">補貨交期 (最快/慢)</Th>
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
                    <Td align="right">
                      {part.minLeadTimeDays === null || part.minLeadTimeDays === undefined ? (
                        part.maxLeadTimeDays === null ? '-' : `${Math.round(part.maxLeadTimeDays / 7)} 週`
                      ) : (
                        part.maxLeadTimeDays === null || part.maxLeadTimeDays === part.minLeadTimeDays ? (
                          `${Math.round(part.minLeadTimeDays / 7)} 週`
                        ) : (
                          `${Math.round(part.minLeadTimeDays / 7)} ~ ${Math.round(part.maxLeadTimeDays / 7)} 週`
                        )
                      )}
                    </Td>
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

      {/* Modal Dialog for Thresholds */}
      {showThresholdsModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(16px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => {
            if (!savingThresholds) {
              setShowThresholdsModal(false);
              setEditingThresholds(null);
              setIsEditing(false);
            }
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
              width: '90%',
              maxWidth: 960,
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid var(--border)',
              overflow: 'hidden',
              animation: 'modalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '18px 24px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--surface-2)',
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="settings" size={18} />
                15 個類別的「安全水位 / 補貨水位」具體數值設定
                {isAdmin ? (
                  <span style={{ fontSize: 11, fontWeight: 700, background: isEditing ? '#FFFAEB' : '#ECFDF3', color: isEditing ? '#B54708' : '#027A48', padding: '3px 10px', borderRadius: 999, marginLeft: 8, border: isEditing ? '1px solid #FEDF89' : '1px solid #A3E635' }}>
                    管理員模式{isEditing ? ' (編輯中)' : ' (檢視)'}
                  </span>
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 500, background: '#F2F4F7', color: '#344054', padding: '3px 10px', borderRadius: 999, marginLeft: 8, border: '1px solid var(--border)' }}>
                    一般使用者 (唯讀)
                  </span>
                )}
              </h3>
              <button
                disabled={savingThresholds}
                onClick={() => {
                  setShowThresholdsModal(false);
                  setEditingThresholds(null);
                  setIsEditing(false);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  color: 'var(--text-3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--surface-3)';
                  e.currentTarget.style.color = 'var(--text)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'none';
                  e.currentTarget.style.color = 'var(--text-3)';
                }}
              >
                <Icon name="x" size={18} stroke={2.5} />
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              {thresholdsError && (
                <div style={{ background: '#FFF1F0', border: '1px solid #FEE4E2', borderRadius: 8, color: '#B42318', padding: '12px 16px', fontSize: 13, marginBottom: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="alert" size={16} /> {thresholdsError}
                </div>
              )}
              
              <div style={{ marginBottom: 18, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, background: 'var(--surface-2)', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border)' }}>
                {isAdmin ? (
                  <span>
                    💡 <strong>管理員提示：</strong> 您可以點擊下方的「進入編輯模式」直接修改水位設定。儲存後，系統會<strong>自動在背景重新計算</strong>所有料件的風險狀態（🔴 / 🟡 / 🟢），使最新判定立即呈現在首頁。
                  </span>
                ) : (
                  <span>
                    💡 <strong>檢視模式：</strong> 您目前以一般使用者身份檢視水位數值。唯有系統管理員（如 Chang Wei Li 或 Danny Chen）具備修改此水位數值的權限。
                  </span>
                )}
              </div>

              <div style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--text-2)', width: '40%' }}>料件類別</th>
                      <th style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--text-2)', width: '30%' }}>安全水位 (中風險線)</th>
                      <th style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--text-2)', width: '30%' }}>補貨水位 (預警期線)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DEMAND_CATEGORIES.map((cat, idx) => {
                      const id = cat.categoryId;
                      const thr = editingThresholds?.[id] || thresholds[id] || { minStock: 1000, lowStock: 5000 };
                      const isEven = idx % 2 === 0;
                      
                      return (
                        <tr 
                          key={id} 
                          style={{ 
                            borderBottom: '1px solid var(--hairline)', 
                            background: isEven ? '#fff' : 'var(--bg)',
                            transition: 'background-color 0.15s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--surface-2)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = isEven ? '#fff' : 'var(--bg)';
                          }}
                        >
                          <td style={{ padding: '12px 18px', fontWeight: 600, color: 'var(--text)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, background: 'var(--surface-3)', color: 'var(--text-2)', fontSize: 11, fontWeight: 800 }}>
                                {categoryNumber(id)}
                              </span>
                              <span>{categoryName(id, cat.category)}</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 18px' }}>
                            {isAdmin && isEditing && editingThresholds ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                <input
                                  type="number"
                                  min="0"
                                  disabled={savingThresholds}
                                  value={thr.minStock}
                                  onChange={(e) => {
                                    const val = Math.max(0, parseInt(e.target.value) || 0);
                                    setEditingThresholds(prev => prev ? ({
                                      ...prev,
                                      [id]: { ...prev[id], minStock: val }
                                    }) : null);
                                  }}
                                  style={{
                                    width: 120,
                                    padding: '6px 12px',
                                    borderRadius: 6,
                                    border: '1px solid var(--border-strong)',
                                    fontSize: 13,
                                    textAlign: 'right',
                                    fontWeight: 700,
                                    color: '#B54708',
                                    background: '#FFFAEB',
                                    outline: 'none',
                                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)',
                                    transition: 'all 0.15s ease',
                                  }}
                                  onFocus={(e) => {
                                    e.target.style.borderColor = 'var(--primary)';
                                    e.target.style.boxShadow = '0 0 0 3px rgba(11,37,69,0.12)';
                                  }}
                                  onBlur={(e) => {
                                    e.target.style.borderColor = 'var(--border-strong)';
                                    e.target.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.05)';
                                  }}
                                />
                                <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>顆</span>
                              </div>
                            ) : (
                              <span style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                padding: '4px 10px', 
                                borderRadius: 6, 
                                background: '#FFFAEB', 
                                color: '#B54708', 
                                fontWeight: 700,
                                fontSize: 12.5
                              }}>
                                {(thresholds[id]?.minStock ?? 1000).toLocaleString()} 顆
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '12px 18px' }}>
                            {isAdmin && isEditing && editingThresholds ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                <input
                                  type="number"
                                  min="0"
                                  disabled={savingThresholds}
                                  value={thr.lowStock}
                                  onChange={(e) => {
                                    const val = Math.max(0, parseInt(e.target.value) || 0);
                                    setEditingThresholds(prev => prev ? ({
                                      ...prev,
                                      [id]: { ...prev[id], lowStock: val }
                                    }) : null);
                                  }}
                                  style={{
                                    width: 120,
                                    padding: '6px 12px',
                                    borderRadius: 6,
                                    border: '1px solid var(--border-strong)',
                                    fontSize: 13,
                                    textAlign: 'right',
                                    fontWeight: 700,
                                    color: 'var(--text)',
                                    background: '#fff',
                                    outline: 'none',
                                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)',
                                    transition: 'all 0.15s ease',
                                  }}
                                  onFocus={(e) => {
                                    e.target.style.borderColor = 'var(--primary)';
                                    e.target.style.boxShadow = '0 0 0 3px rgba(11,37,69,0.12)';
                                  }}
                                  onBlur={(e) => {
                                    e.target.style.borderColor = 'var(--border-strong)';
                                    e.target.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.05)';
                                  }}
                                />
                                <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>顆</span>
                              </div>
                            ) : (
                              <span style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                padding: '4px 10px', 
                                borderRadius: 6, 
                                background: '#F2F4F7', 
                                color: 'var(--text-2)', 
                                fontWeight: 600,
                                fontSize: 12.5
                              }}>
                                {(thresholds[id]?.lowStock ?? 5000).toLocaleString()} 顆
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--border)',
                background: 'var(--surface-2)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {isAdmin ? (
                  isEditing ? (
                    <span>✍️ 正在編輯模式，修改完畢後請點擊「儲存設定」</span>
                  ) : (
                    <span>💡 您擁有管理員權限，可點擊右側按鈕進行修改</span>
                  )
                ) : (
                  <span>🔒 唯讀模式 (僅供檢視)</span>
                )}
              </div>
              
              <div style={{ display: 'flex', gap: 10 }}>
                {/* 檢視模式 & 管理員 */}
                {isAdmin && !isEditing && (
                  <>
                    <button
                      onClick={() => {
                        setShowThresholdsModal(false);
                        setEditingThresholds(null);
                      }}
                      className="btn"
                      style={{ fontSize: 13, height: 36, padding: '0 16px' }}
                    >
                      關閉
                    </button>
                    <button
                      onClick={() => {
                        setEditingThresholds(JSON.parse(JSON.stringify(thresholds)));
                        setIsEditing(true);
                      }}
                      className="btn-primary"
                      style={{ fontSize: 13, height: 36, padding: '0 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      🔧 進入編輯模式
                    </button>
                  </>
                )}

                {/* 編輯模式 (必須是管理員) */}
                {isAdmin && isEditing && (
                  <>
                    <button
                      disabled={savingThresholds}
                      onClick={() => {
                        setIsEditing(false);
                        setEditingThresholds(null);
                      }}
                      className="btn"
                      style={{ fontSize: 13, height: 36, padding: '0 16px' }}
                    >
                      取消編輯
                    </button>
                    <button
                      disabled={savingThresholds}
                      onClick={async () => {
                        if (!editingThresholds) return;
                        setSavingThresholds(true);
                        setThresholdsError(null);
                        try {
                          const resp = await fetch('/api/demand-forecast/thresholds', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ thresholds: editingThresholds }),
                          });
                          if (!resp.ok) {
                            const errData = await resp.json();
                            throw new Error(errData.error || `HTTP ${resp.status}`);
                          }
                          
                          setThresholds(editingThresholds);
                          setIsEditing(false);
                          setShowThresholdsModal(false);
                          setEditingThresholds(null);
                          await loadForecast('cached');
                        } catch (err) {
                          setThresholdsError(err instanceof Error ? err.message : '儲存水位設定失敗');
                        } finally {
                          setSavingThresholds(false);
                        }
                      }}
                      className="btn-primary"
                      style={{ fontSize: 13, height: 36, padding: '0 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      {savingThresholds ? '儲存中...' : '儲存設定'}
                    </button>
                  </>
                )}

                {/* 非管理員 */}
                {!isAdmin && (
                  <button
                    onClick={() => {
                      setShowThresholdsModal(false);
                    }}
                    className="btn-primary"
                    style={{ fontSize: 13, height: 36, padding: '0 18px' }}
                  >
                    關閉
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
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

function Panel({ title, children, tone, id }: { title: string; children: ReactNode; tone?: PanelTone; id?: string }) {
  const toneStyle = tone ? PANEL_TONES[tone] : null;
  return (
    <section
      id={id}
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
  id,
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
  id?: string;
}) {
  const toneStyle = PANEL_TONES[tone];
  return (
    <Panel title={title} tone={tone} id={id}>
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

interface LifecycleTag {
  text: string;
  bg: string;
  color: string;
  border: string;
}

function getLifecycleTags(title: string, titleZh?: string): LifecycleTag[] {
  const combined = `${title} ${titleZh || ''}`.toLowerCase();
  const tags: LifecycleTag[] = [];

  // 1. EOL 停產
  if (/\beol\b|discontinu(e|ance|ed)|obsolescen(ce|t)|obsolete|phase[- ]out|end[- ]of[- ]life|停產|終止生命週期|廢止/i.test(combined)) {
    tags.push({ text: 'EOL 停產', bg: '#FFF1F0', color: '#B42318', border: '#FDA29B' });
  }

  // 2. NRND 不推薦設計
  if (/\bnrnd\b|not[- ]recommended[- ]for[- ]new[- ]design|not[- ]recommended|不推薦設計|新設計不推薦/i.test(combined)) {
    tags.push({ text: 'NRND 不推薦設計', bg: '#FFFAEB', color: '#B54708', border: '#FEDF89' });
  }

  // 3. PCN 變更
  if (/\bpcn\b|product[- ]change[- ]notification|product[- ]change|process[- ]change|change[- ]notification|產品變更通知|變更通知|產品變更|製程變更/i.test(combined)) {
    tags.push({ text: 'PCN 變更', bg: '#F4F3FF', color: '#5925DC', border: '#D9D6FE' });
  }

  // 4. LTB 最後採購
  if (/\bltb\b|last[- ]time[- ]buy|last[- ]buy|last[- ]order|最後採購|最後下單|最後購買期/i.test(combined)) {
    tags.push({ text: 'LTB 最後採購', bg: '#F0F9FF', color: '#026AA2', border: '#B9E6FE' });
  }

  return tags;
}

function NewsPanel({ title, tone, items, emptyText, badge, id }: { title: string; tone: PanelTone; items: ForecastNews[]; emptyText: string; badge: string; id?: string }) {
  const toneStyle = PANEL_TONES[tone];
  const [lifecycleFilter, setLifecycleFilter] = useState<'all' | 'EOL' | 'NRND' | 'PCN' | 'LTB'>('all');

  const filteredItems = useMemo(() => {
    if (lifecycleFilter === 'all') return items;
    return items.filter((item) => {
      const tags = getLifecycleTags(item.title, item.titleZh);
      if (lifecycleFilter === 'EOL') return tags.some(t => t.text === 'EOL 停產');
      if (lifecycleFilter === 'NRND') return tags.some(t => t.text === 'NRND 不推薦設計');
      if (lifecycleFilter === 'PCN') return tags.some(t => t.text === 'PCN 變更');
      if (lifecycleFilter === 'LTB') return tags.some(t => t.text === 'LTB 最後採購');
      return true;
    });
  }, [items, lifecycleFilter]);

  return (
    <Panel title={title} tone={tone} id={id}>
      {/* 篩選標籤列 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginRight: 4 }}>內容篩選:</span>
        {(['all', 'EOL', 'NRND', 'PCN', 'LTB'] as const).map((filter) => {
          const config = {
            all: { label: '全部', bg: '#f2f4f7', color: '#344054', activeBg: '#e4e7ec', activeColor: '#101828' },
            EOL: { label: 'EOL 停產', bg: '#FFF1F0', color: '#B42318', activeBg: '#FEF3F2', activeColor: '#912018' },
            NRND: { label: 'NRND 不推薦', bg: '#FFFAEB', color: '#B54708', activeBg: '#FEF0C7', activeColor: '#b54708' },
            PCN: { label: 'PCN 變更', bg: '#F4F3FF', color: '#5925DC', activeBg: '#E8E5FF', activeColor: '#4a1fb8' },
            LTB: { label: 'LTB 最後採購', bg: '#F0F9FF', color: '#026AA2', activeBg: '#E0F2FE', activeColor: '#025a87' },
          }[filter];
          const active = lifecycleFilter === filter;
          
          const count = filter === 'all' ? items.length : items.filter((item) => {
            const tags = getLifecycleTags(item.title, item.titleZh);
            if (filter === 'EOL') return tags.some(t => t.text === 'EOL 停產');
            if (filter === 'NRND') return tags.some(t => t.text === 'NRND 不推薦設計');
            if (filter === 'PCN') return tags.some(t => t.text === 'PCN 變更');
            if (filter === 'LTB') return tags.some(t => t.text === 'LTB 最後採購');
            return false;
          }).length;

          // 只有當該分類有內容、或者是「全部」篩選、或者是當前選中的分類，才渲染出來
          if (count === 0 && !active && filter !== 'all') return null;

          return (
            <button
              key={filter}
              onClick={() => setLifecycleFilter(filter)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                border: active ? `1px solid ${config.color}` : '1px solid transparent',
                borderRadius: 6,
                padding: '3px 8px',
                fontSize: 11,
                fontWeight: 700,
                background: active ? config.activeBg : config.bg,
                color: active ? config.activeColor : config.color,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                opacity: active ? 1 : 0.8,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.opacity = '0.8'; }}
            >
              {config.label}
              <span style={{ fontSize: 9, opacity: 0.7, fontWeight: 800 }}>({count})</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {filteredItems.slice(0, 18).map((item, idx) => {
          const lifecycleTags = getLifecycleTags(item.title, item.titleZh);
          return (
            <div key={`${item.link}-${idx}`} style={{ border: `1px solid ${toneStyle.border}`, borderRadius: 8, padding: '10px 12px', background: '#fff' }}>
              <a href={`https://translate.google.com/translate?sl=auto&tl=zh-TW&u=${encodeURIComponent(item.link)}`} target="_blank" rel="noreferrer" title="開啟中文翻譯新聞" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
                {lifecycleTags.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                    {lifecycleTags.map((tag) => {
                      const filterVal = {
                        'EOL 停產': 'EOL',
                        'NRND 不推薦設計': 'NRND',
                        'PCN 變更': 'PCN',
                        'LTB 最後採購': 'LTB',
                      }[tag.text] as any;
                      return (
                        <span
                          key={tag.text}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setLifecycleFilter(lifecycleFilter === filterVal ? 'all' : filterVal);
                          }}
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            backgroundColor: tag.bg,
                            color: tag.color,
                            border: `1px solid ${tag.border}`,
                            borderRadius: 4,
                            padding: '1px 5px',
                            cursor: 'pointer',
                          }}
                          title={`點擊過濾以僅顯示「${tag.text}」`}
                        >
                          {tag.text}
                        </span>
                      );
                    })}
                  </div>
                )}
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
          );
        })}
        {!filteredItems.length && (
          <EmptyLine text={items.length ? '此篩選分類下無符合條件之內容。' : emptyText} />
        )}
      </div>
    </Panel>
  );
}

function RiskBadge({ value }: { value: '正常' | '有缺料風險' | '尚未查詢' | '無代理商資料' | '中風險' }) {
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
  if (value === '中風險') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '3px 8px', fontSize: 11, fontWeight: 700, background: '#FFFAEB', color: '#B54708', border: '1px solid #FEDF89' }}>
        中風險
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

function RiskCellBadge({ level, highLabel = '有缺料風險', medLabel = '中風險' }: { level: 'high' | 'medium' | 'none'; highLabel?: string; medLabel?: string }) {
  const config = {
    high: { bg: '#FFF1F0', color: '#B42318', dot: '#D92D20', text: highLabel },
    medium: { bg: '#FFFAEB', color: '#B54708', dot: '#F79009', text: medLabel },
    none: { bg: '#ECFDF3', color: '#027A48', dot: '#12B76A', text: '正常' },
  }[level];
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
        background: config.bg,
        color: config.color,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: config.dot }}></span>
      {config.text}
    </span>
  );
}

const RISK_TYPE_LABELS: Record<string, string> = {
  lead_time_increase: '交期拉長',
  allocation: '產能配給 (Allocation)',
  price_increase: '價格調漲',
  demand_surge: '需求暴增',
  constrained_supply: '供貨吃緊',
  geopolitical: '地緣政治風險',
  lifecycle: '生命週期 EOL/PCN'
};

function MarketReportsPanel({
  id,
  category,
  reports,
  onSelectCategory,
}: {
  id: string;
  category: string;
  reports: any[];
  onSelectCategory: (cat: string) => void;
}) {
  const filteredReports = useMemo(() => {
    if (category === 'all') return reports;
    return reports.filter((r) => r.categoryIds.includes(category));
  }, [reports, category]);

  const selectedCategoryLabel = category === 'all'
    ? '全部類別'
    : categoryName(category, DEMAND_CATEGORIES.find((item) => item.categoryId === category)?.category ?? category);

  return (
    <section
      id={id}
      style={{
        border: '1px solid #BBF7D0',
        borderLeft: '4px solid #16A34A',
        borderRadius: 8,
        background: '#F0FDF4',
        padding: 20,
        marginBottom: 18,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="globe" size={16} /> 市場報告 / 產業情報預警摘要：{selectedCategoryLabel}
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
            每週自動追蹤免費公開市場情報，並利用規則引擎對應至 15 個料件類別。
          </p>
        </div>
        
        {/* 快速篩選資訊 */}
        {category !== 'all' && (
          <button
            onClick={() => onSelectCategory('all')}
            style={{
              background: '#fff',
              border: '1px solid #BBF7D0',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: '#166534',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            重設篩選 (顯示全部)
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 16 }}>
        {filteredReports.map((report) => {
          const repLevel = report.riskLevel;
          const reportDate = report.publishedAt ? new Date(report.publishedAt).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '未知時間';
          
          return (
            <div
              key={report.id}
              style={{
                background: '#fff',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 16,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.02)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 12,
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.06)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.02)';
              }}
            >
              <div>
                {/* 頂部資訊列 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#166534', background: '#DCFCE7', borderRadius: 4, padding: '2px 6px' }}>
                      {report.source}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 8 }}>
                      {reportDate}
                    </span>
                  </div>
                  <RiskCellBadge level={repLevel === '有缺料風險' ? 'high' : repLevel === '中風險' ? 'medium' : 'none'} />
                </div>

                {/* 標題 */}
                <h4 style={{ margin: '0 0 8px 0', fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 }}>
                  {report.title}
                </h4>

                {/* 影響類別 & 信心度 & 風險類型 */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {report.categoryIds.map((catId: string) => (
                    <span
                      key={catId}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCategory(catId);
                      }}
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        backgroundColor: 'var(--surface-3)',
                        color: 'var(--text-2)',
                        borderRadius: 4,
                        padding: '1px 6px',
                        cursor: 'pointer',
                        border: '1px solid var(--border)'
                      }}
                      title="點擊篩選此類別"
                    >
                      🏷️ {categoryName(catId, catId)}
                    </span>
                  ))}
                  
                  <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    backgroundColor: report.confidence === 'high' ? '#E0F2FE' : report.confidence === 'medium' ? '#FFFAEB' : '#F2F4F7',
                    color: report.confidence === 'high' ? '#0369A1' : report.confidence === 'medium' ? '#B54708' : '#475467',
                    borderRadius: 4,
                    padding: '1px 6px',
                    border: '1px solid transparent'
                  }}>
                    🎯 信心度: {report.confidence === 'high' ? '高' : report.confidence === 'medium' ? '中' : '低'}
                  </span>

                  {report.riskTypes.map((type: string) => (
                    <span
                      key={type}
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        backgroundColor: '#F3F4F6',
                        color: '#374151',
                        borderRadius: 4,
                        padding: '1px 6px',
                        border: '1px solid #E5E7EB'
                      }}
                    >
                      ⚡ {RISK_TYPE_LABELS[type] || type}
                    </span>
                  ))}
                </div>

                {/* 中文摘要 */}
                <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 8 }}>
                  {report.summaryZh}
                </div>

                {/* 證據原文片段 */}
                {report.evidenceText && (
                  <div style={{
                    fontSize: 11.5,
                    color: 'var(--text-3)',
                    lineHeight: 1.45,
                    borderLeft: '3px solid #BBF7D0',
                    paddingLeft: 8,
                    fontStyle: 'italic',
                    background: 'var(--bg)',
                    padding: '6px 8px',
                    borderRadius: '0 4px 4px 0'
                  }}>
                    "{report.evidenceText}"
                  </div>
                )}
              </div>

              {/* 原文連結 */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <a
                  href={report.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#166534',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  查看情報原文 ↗
                </a>
              </div>
            </div>
          );
        })}
        {filteredReports.length === 0 && (
          <div style={{ gridColumn: '1 / -1', border: '1px dashed #BBF7D0', borderRadius: 8, padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            目前沒有市場報告預警訊號
          </div>
        )}
      </div>
    </section>
  );
}
