'use client';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/Header';
import { SubBar } from '@/components/SubBar';
import { Hero } from '@/components/Hero';
import { ProductCard } from '@/components/ProductCard';
import { SupplierTable, type SortKey, type SortDir } from '@/components/SupplierTable';
import { PriceBreaks } from '@/components/PriceBreaks';
import { SpecGrid } from '@/components/SpecGrid';
import { ComparisonChart } from '@/components/ComparisonChart';
import { Footer } from '@/components/Footer';
import { Icon } from '@/components/Icon';
import { priceAtQty, type PartInfo, type Supplier } from '@/lib/part-types';

const RECENT_STORAGE_KEY = 'speedpart.singleSearch.recent.v1';
const MAX_RECENT_SEARCHES = 6;

interface ApiPriceBreak { quantity: number; unitPrice: number; currency: string }
interface ApiVariation { packageType: string; minQty: number; breaks: ApiPriceBreak[] }
interface ApiMarketplaceVariation {
  supplierName: string;
  stockQty: number;
  minQty: number;
  breaks: ApiPriceBreak[];
}
interface ApiPartResult {
  supplier: string;
  manufacturerPartNumber: string;
  supplierPartNumber: string;
  manufacturer: string;
  description: string;
  quantityAvailable: number;
  unitPrice: number | null;
  currency: string;
  priceBreaks: ApiPriceBreak[];
  altPricing?: { currency: string; localeSite: string; unitPrice: number | null; priceBreaks: ApiPriceBreak[] };
  variations?: ApiVariation[];
  marketplaceVariations?: ApiMarketplaceVariation[];
  productUrl: string;
  datasheetUrl?: string | null;
  category?: string | null;
  rohsStatus?: string | null;
  leadTimeDays?: number | null;
  availabilityStatus?: string | null;
  lastUpdated: string;
}
interface ApiSupplierBlock {
  supplier: string;
  results: ApiPartResult[];
  error?: { code: string; message: string };
}
interface ApiSearchResponse {
  partNumber: string;
  suppliers: ApiSupplierBlock[];
}

function formatTimeUTC(date: Date): string {
  return date.toISOString().slice(11, 19) + ' UTC';
}

function normalizeMpn(value?: string): string {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function findExactResult(block: ApiSupplierBlock, query: string): ApiPartResult | undefined {
  const target = normalizeMpn(query);
  return block.results.find((result) => normalizeMpn(result.manufacturerPartNumber) === target);
}

function relativeTime(iso: string): { text: string; sec: number } {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return { text: `${sec}s ago`, sec };
  if (sec < 3600) return { text: `${Math.floor(sec / 60)} min ago`, sec };
  if (sec < 86400) return { text: `${Math.floor(sec / 3600)} hr ago`, sec };
  return { text: `${Math.floor(sec / 86400)} d ago`, sec };
}

const SUPPLIER_META: Record<string, { id: string; name: string; region: string }> = {
  digikey: { id: 'digikey', name: 'DigiKey', region: 'US' },
  'mouser hk': { id: 'mouser-hk', name: 'Mouser HK', region: 'HK' },
  'mouser vn': { id: 'mouser-vn', name: 'Mouser VN', region: 'VN' },
};

function supplierFromResult(result: ApiPartResult): Supplier {
  const key = result.supplier.toLowerCase();
  const meta = SUPPLIER_META[key] ?? { id: key, name: result.supplier, region: 'Global' };
  const breaks = result.priceBreaks.length
    ? result.priceBreaks.map((b) => ({ qty: b.quantity, price: b.unitPrice }))
    : result.unitPrice !== null
      ? [{ qty: 1, price: result.unitPrice }]
      : [];
  const rel = relativeTime(result.lastUpdated);
  const leadDays = result.leadTimeDays ?? 0;
  const leadTime = leadDays === 0 ? 'Ships today' : `${Math.round(leadDays / 7)} weeks`;
  const varMinQtys = (result.variations ?? []).map((v) => v.minQty).filter((n) => n > 0);
  const moq = varMinQtys.length ? Math.min(...varMinQtys) : (breaks[0]?.qty ?? 1);
  const mpqCandidate = varMinQtys.length ? Math.max(...varMinQtys) : undefined;
  const mpq = mpqCandidate !== undefined && mpqCandidate !== moq ? mpqCandidate : undefined;
  return {
    id: meta.id,
    name: meta.name,
    region: meta.region,
    status: 'available',
    supplierPartNumber: result.supplierPartNumber,
    stock: result.quantityAvailable,
    moq,
    ...(mpq !== undefined ? { mpq } : {}),
    leadTime,
    leadDays,
    unitPrice: result.unitPrice ?? breaks[0]?.price ?? 0,
    currency: result.currency || 'USD',
    updated: rel.text,
    updatedSec: rel.sec,
    breaks,
    ...(result.altPricing?.priceBreaks.length
      ? {
          altBreaks: result.altPricing.priceBreaks.map((b) => ({ qty: b.quantity, price: b.unitPrice })),
          altCurrency: result.altPricing.currency,
        }
      : {}),
    productUrl: result.productUrl,
    datasheetUrl: result.datasheetUrl ?? undefined,
    lifecycleStatus: result.availabilityStatus ?? undefined,
    isLive: true,
    ...(result.marketplaceVariations?.length
      ? { marketplaceVariations: result.marketplaceVariations.map((mv) => ({ supplierName: mv.supplierName, stockQty: mv.stockQty, minQty: mv.minQty })) }
      : {}),
  };
}

function notFoundSupplierFromBlock(block: ApiSupplierBlock): Supplier {
  const key = block.supplier.toLowerCase();
  const meta = SUPPLIER_META[key] ?? { id: key, name: block.supplier, region: 'Global' };
  return {
    id: meta.id,
    name: meta.name,
    region: meta.region,
    status: 'notfound',
    stock: 0,
    moq: 0,
    leadTime: '—',
    leadDays: 0,
    unitPrice: 0,
    currency: 'USD',
    updated: '0s ago',
    updatedSec: 0,
    breaks: [],
    isLive: true,
  };
}

function emptyStockSupplierFromResult(result: ApiPartResult): Supplier {
  return {
    ...supplierFromResult(result),
    status: 'nostock',
    breaks: [],
    unitPrice: 0,
  };
}

function restrictedSupplierFromBlock(block: ApiSupplierBlock): Supplier {
  const key = block.supplier.toLowerCase();
  const meta = SUPPLIER_META[key] ?? { id: key, name: block.supplier, region: 'Global' };
  return {
    id: meta.id,
    name: meta.name,
    region: meta.region,
    status: 'restricted',
    stock: 0,
    moq: 0,
    leadTime: '—',
    leadDays: 0,
    unitPrice: 0,
    currency: 'USD',
    updated: '0s ago',
    updatedSec: 0,
    breaks: [],
    isLive: true,
    errorMsg: 'Restricted',
  };
}

function buildPartInfo(query: string, exactResults: ApiPartResult[]): PartInfo {
  const pickFirst = (getter: (r: ApiPartResult) => string | null | undefined): string | undefined => {
    for (const r of exactResults) {
      const v = getter(r)?.trim();
      if (v) return v;
    }
    return undefined;
  };
  return {
    mpn: pickFirst((r) => r.manufacturerPartNumber) ?? query,
    manufacturer: pickFirst((r) => r.manufacturer) ?? '—',
    description: pickFirst((r) => r.description) ?? '尚無供應商詳細描述',
    category: pickFirst((r) => r.category),
    lifecycle: pickFirst((r) => r.availabilityStatus),
    rohsStatus: pickFirst((r) => r.rohsStatus),
    datasheetUrl: pickFirst((r) => r.datasheetUrl),
    primaryProductUrl: pickFirst((r) => r.productUrl),
    supplierPartNumber: pickFirst((r) => r.supplierPartNumber),
  };
}

function friendlySupplierError(block: ApiSupplierBlock): string {
  const supplier = block.supplier;
  const supplierKey = supplier.toLowerCase();
  const supplierName = SUPPLIER_META[supplierKey]?.name ?? supplier;
  const code = block.error?.code;
  if (supplierKey === 'digikey' && (code === 'RATE_LIMITED' || code === 'AUTH_FAILED')) {
    return 'DigiKey 已達查詢上限，台灣時間 08:00 重置';
  }
  if (supplierKey.startsWith('mouser') && code === 'RESTRICTED') {
    return `${supplierName} restricted`;
  }
  if (supplierKey.startsWith('mouser') && code === 'RATE_LIMITED') {
    return /MaxCallPerDay|Maximum calls per day exceeded/i.test(block.error?.message ?? '')
      ? `${supplierName} 已達每日查詢上限`
      : `${supplierName} 暫時達到速率限制`;
  }
  return `${supplierName}: ${code ?? 'ERROR'}`;
}

function shouldShowSupplierAlert(block: ApiSupplierBlock): boolean {
  const code = block.error?.code;
  return code === 'RATE_LIMITED' || code === 'AUTH_FAILED' || code === 'CONFIG_MISSING' || code === 'UPSTREAM_ERROR';
}

function HomePageContent() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');
  const [part, setPart] = useState<PartInfo | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('unitPrice');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [activeTab, setActiveTab] = useState('');
  const [qtyInput, setQtyInput] = useState('1');
  const [qty, setQty] = useState(1);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string>('—');
  const lastSearchKeyRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(RECENT_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        setRecentSearches(
          parsed
            .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
            .slice(0, MAX_RECENT_SEARCHES)
        );
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  useEffect(() => {
    if (!toast || toast.kind !== 'ok') return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const recordRecentSearch = useCallback((mpn: string) => {
    const cleaned = mpn.trim();
    if (!cleaned) return;
    setRecentSearches((prev) => {
      const next = [cleaned, ...prev.filter((item) => item.toUpperCase() !== cleaned.toUpperCase())].slice(
        0,
        MAX_RECENT_SEARCHES
      );
      try {
        window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const liveCount = useMemo(() => suppliers.filter((s) => s.isLive).length, [suppliers]);
  const totalCount = suppliers.length;
  const matchedCount = useMemo(
    () => suppliers.filter((s) => s.status !== 'notfound' && s.status !== 'restricted').length,
    [suppliers]
  );

  const sorted = useMemo(() => {
    const getStatusRank = (s: Supplier) => (s.status === 'notfound' ? 2 : s.status === 'restricted' ? 1 : 0);
    const arr = [...suppliers];
    arr.sort((a, b) => {
      const rankDiff = getStatusRank(a) - getStatusRank(b);
      if (rankDiff !== 0) return rankDiff;
      if (sortKey === 'unitPrice') {
        const ap = priceAtQty(a, qty);
        const bp = priceAtQty(b, qty);
        const aFinite = Number.isFinite(ap);
        const bFinite = Number.isFinite(bp);
        if (!aFinite && !bFinite) return 0;
        if (!aFinite) return 1;
        if (!bFinite) return -1;
        return sortDir === 'asc' ? ap - bp : bp - ap;
      }
      const av = (a as unknown as Record<string, unknown>)[sortKey];
      const bv = (b as unknown as Record<string, unknown>)[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = Number(av ?? 0);
      const bn = Number(bv ?? 0);
      return sortDir === 'asc' ? an - bn : bn - an;
    });
    return arr;
  }, [suppliers, sortKey, sortDir, qty]);

  const visibleSuppliers = useMemo(
    () => (onlyInStock ? sorted.filter((s) => s.stock > 0 && s.status !== 'notfound' && s.status !== 'restricted') : sorted),
    [sorted, onlyInStock]
  );

  const bestIds = useMemo(() => {
    const available = suppliers.filter(
      (s) => s.status !== 'restricted' && s.status !== 'notfound' && s.stock > 0 && Number.isFinite(priceAtQty(s, qty))
    );
    const prices = available.map((s) => priceAtQty(s, qty));
    const bestPrice = Math.min(...prices);
    if (!Number.isFinite(bestPrice)) return [];
    return available
      .filter((s) => Math.abs(priceAtQty(s, qty) - bestPrice) < 0.000001)
      .map((s) => s.id);
  }, [suppliers, qty]);

  const pricedSuppliers = useMemo(
    () => suppliers.filter((s) => s.status !== 'restricted' && s.breaks.length > 0 && s.stock > 0 && Number.isFinite(priceAtQty(s, qty))),
    [suppliers, qty]
  );

  const handleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(k);
      setSortDir(k === 'stock' ? 'desc' : 'asc');
    }
  };

  const handleSearch = useCallback(async (q: string, qtyOverride?: number) => {
    const trimmedMpn = q.trim();
    if (!trimmedMpn) {
      setToast({ msg: '請輸入料號', kind: 'err' });
      return;
    }

    const rawQty =
      qtyOverride !== undefined
        ? qtyOverride
        : qtyInput.trim() === ''
          ? 1
          : Number(qtyInput.replace(/,/g, ''));

    if (!Number.isFinite(rawQty) || rawQty <= 0) {
      setToast({ msg: '數量必須為正整數', kind: 'err' });
      return;
    }

    const normalizedQty = Math.round(rawQty);
    lastSearchKeyRef.current = `${trimmedMpn.toUpperCase()}:${normalizedQty}`;
    setQuery(trimmedMpn);
    setQty(normalizedQty);
    setQtyInput(String(normalizedQty));

    if (typeof window !== 'undefined') {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('mpn', trimmedMpn);
      nextUrl.searchParams.set('qty', String(normalizedQty));
      window.history.replaceState(null, '', nextUrl.toString());
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ partNumber: trimmedMpn, suppliers: 'digikey,mouser hk,mouser vn' });
      const resp = await fetch(`/api/search?${params.toString()}`);
      if (!resp.ok) {
        setToast({ msg: `查詢失敗 (${resp.status})`, kind: 'err' });
        setRefreshedAt(formatTimeUTC(new Date()));
        return;
      }
      const json: ApiSearchResponse = await resp.json();
      const exactResults = json.suppliers
        .map((block) => findExactResult(block, trimmedMpn))
        .filter((result): result is ApiPartResult => Boolean(result));
      const errors = json.suppliers.filter((b) => b.error);
      const alerts = errors.filter(shouldShowSupplierAlert);
      const restrictedRows = errors
        .filter((b) => b.error?.code === 'RESTRICTED')
        .map(restrictedSupplierFromBlock);
      const exactMissRows = json.suppliers
        .filter((block) => !block.error && !findExactResult(block, trimmedMpn))
        .map(notFoundSupplierFromBlock);
      const notFoundErrorRows = errors
        .filter((block) => block.error?.code === 'EMPTY_RESULT' || block.error?.code === 'NOT_FOUND')
        .map(notFoundSupplierFromBlock);
      const notFoundRows = [...exactMissRows, ...notFoundErrorRows];

      if (exactResults.length > 0 || restrictedRows.length > 0 || notFoundRows.length > 0) {
        const liveRows = exactResults.map((result) => (
          result.quantityAvailable > 0 ? supplierFromResult(result) : emptyStockSupplierFromResult(result)
        ));
        const visibleRows = [...liveRows, ...restrictedRows, ...notFoundRows];
        const nextPart = buildPartInfo(trimmedMpn, exactResults);
        setSuppliers(visibleRows);
        setPart(nextPart);
        setHasSearched(true);
        setSelectedRow(liveRows[0]?.id ?? visibleRows[0]?.id ?? null);
        setActiveTab(liveRows.find((s) => s.breaks.length > 0)?.id ?? liveRows[0]?.id ?? visibleRows[0]?.id ?? '');
        recordRecentSearch(nextPart.mpn || trimmedMpn);
        setToast(alerts.length > 0 ? { msg: alerts.map(friendlySupplierError).join('；'), kind: 'err' } : null);
      } else if (alerts.length > 0) {
        setToast({ msg: alerts.map(friendlySupplierError).join('；'), kind: 'err' });
      } else {
        setToast({ msg: `找不到 "${trimmedMpn}" 的供應商資料`, kind: 'err' });
      }
      setRefreshedAt(formatTimeUTC(new Date()));
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : String(e), kind: 'err' });
    } finally {
      setLoading(false);
    }
  }, [qtyInput, recordRecentSearch]);

  const handleSearchRef = useRef(handleSearch);
  handleSearchRef.current = handleSearch;

  useEffect(() => {
    const urlMpn = searchParams.get('mpn')?.trim() ?? '';
    if (!urlMpn) return;
    const rawUrlQty = Number((searchParams.get('qty') ?? '').replace(/,/g, ''));
    const nextQty = Number.isFinite(rawUrlQty) && rawUrlQty > 0 ? Math.round(rawUrlQty) : 1;
    const key = `${urlMpn.toUpperCase()}:${nextQty}`;
    if (lastSearchKeyRef.current === key) return;
    handleSearchRef.current(urlMpn, nextQty);
  }, [searchParams]);

  useEffect(() => {
    const handleQuickSearchEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ mpn?: string; qty?: number }>;
      const targetMpn = customEvent.detail?.mpn?.trim();
      if (!targetMpn) return;
      const targetQty =
        typeof customEvent.detail?.qty === 'number' && customEvent.detail.qty > 0
          ? Math.round(customEvent.detail.qty)
          : 1;
      handleSearchRef.current(targetMpn, targetQty);
    };
    window.addEventListener('speedpart:quick-search', handleQuickSearchEvent);
    return () => window.removeEventListener('speedpart:quick-search', handleQuickSearchEvent);
  }, []);

  useEffect(() => {
    if (selectedRow && !suppliers.some((s) => s.id === selectedRow)) {
      setSelectedRow(suppliers[0]?.id ?? null);
    }
  }, [suppliers, selectedRow]);

  useEffect(() => {
    if (pricedSuppliers.length > 0 && !pricedSuppliers.some((s) => s.id === activeTab)) {
      setActiveTab(pricedSuppliers[0].id);
    }
  }, [pricedSuppliers, activeTab]);

  const handleCopyShare = async () => {
    if (!part) return;
    try {
      const shareUrl = `${window.location.origin}/?mpn=${encodeURIComponent(part.mpn)}&qty=${qty}`;
      await navigator.clipboard.writeText(shareUrl);
      setToast({ msg: '已複製分享連結', kind: 'ok' });
    } catch {
      setToast({ msg: '無法存取剪貼簿，請直接複製網址列', kind: 'err' });
    }
  };

  const handleCopyQuote = async () => {
    if (!part) return;
    const lines = [
      `料號: ${part.mpn}（${part.manufacturer}）`,
      `需求數量: ${qty.toLocaleString('en-US')} pcs`,
      `查詢時間: ${refreshedAt}`,
      '',
      ...suppliers.map((s) => {
        if (s.status === 'restricted') return `- ${s.name}: 供貨限制`;
        if (s.status === 'notfound') return `- ${s.name}: 平台沒有這顆料`;
        if (s.stock <= 0) return `- ${s.name}: 沒有庫存`;
        const unit = priceAtQty(s, qty);
        const effectiveQty = s.stock > 0 && qty > s.stock ? s.stock : qty;
        const unitStr = Number.isFinite(unit) ? `${s.currency} ${unit.toFixed(4)}` : '—';
        const totalStr = Number.isFinite(unit) ? `$${(unit * effectiveQty).toFixed(2)}` : '—';
        return `- ${s.name} (${s.region}): 庫存 ${s.stock.toLocaleString('en-US')} / 平均單價 ${unitStr} / 小計 ${totalStr}`;
      }),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setToast({ msg: '已複製報價摘要', kind: 'ok' });
    } catch {
      setToast({ msg: '無法存取剪貼簿', kind: 'err' });
    }
  };

  return (
    <div className="app">
      <Header />
      <Hero
        query={query}
        setQuery={setQuery}
        qtyInput={qtyInput}
        setQtyInput={setQtyInput}
        onSearch={(mpn) => handleSearch(mpn)}
        loading={loading}
        recentSearches={recentSearches}
        onSelectRecent={(mpn) => handleSearch(mpn)}
      />
      <SubBar
        mpn={part?.mpn ?? null}
        category={part?.category ?? null}
        hasSearched={hasSearched}
        liveCount={liveCount}
        totalCount={totalCount}
        refreshedAt={refreshedAt}
      />

      <div className="main">
        {!hasSearched || !part ? (
          <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-4)' }}>
            <Icon name="search" size={32} aria-hidden="true" />
            <p style={{ marginTop: '16px', fontSize: '15px', color: 'var(--text-3)' }}>
              請在上方輸入料號，查詢即時價格與庫存。
            </p>
          </div>
        ) : (
          <>
            <div className="row-2">
              <ProductCard part={part} matchedCount={matchedCount} totalCount={totalCount} />
              <div className="card">
                <div className="card-hd">
                  <h3>
                    <Icon name="compare" size={14} />
                    供應商比較
                    <span className="sub">
                      — {visibleSuppliers.length}{onlyInStock ? `/${suppliers.length}` : ''} 個來源，可排序
                    </span>
                  </h3>
                  <div className="actions">
                    <button
                      type="button"
                      className={'btn ghost' + (onlyInStock ? ' active' : '')}
                      aria-pressed={onlyInStock}
                      onClick={() => setOnlyInStock((v) => !v)}
                    >
                      <Icon name="filter" size={12} /> {onlyInStock ? '僅看有庫存 ✓' : '僅看有庫存'}
                    </button>
                    <button type="button" className="btn ghost" onClick={handleCopyShare}>
                      <Icon name="share" size={12} /> 分享
                    </button>
                    <button type="button" className="btn" onClick={handleCopyQuote}>
                      <Icon name="copy" size={12} /> 複製報價
                    </button>
                  </div>
                </div>
                <div className="card-bd flush">
                  <SupplierTable
                    suppliers={visibleSuppliers}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    bestIds={bestIds}
                    qty={qty}
                    onSelect={(id) => {
                      setSelectedRow(id);
                      if (pricedSuppliers.some((s) => s.id === id)) {
                        setActiveTab(id);
                      }
                    }}
                    selectedId={selectedRow}
                  />
                </div>
              </div>
            </div>

            {pricedSuppliers.length > 0 && (
              <PriceBreaks
                suppliers={pricedSuppliers}
                activeId={activeTab}
                onTab={setActiveTab}
                qty={qty}
                mpn={part.mpn}
                onQtyChange={(nextQty) => {
                  setQty(nextQty);
                  setQtyInput(String(nextQty));
                }}
                onExported={(supplierName) => setToast({ msg: `已匯出 ${supplierName} 階梯價 CSV`, kind: 'ok' })}
              />
            )}

            <div className={'row-3' + (pricedSuppliers.length === 0 ? ' single' : '')}>
              <SpecGrid part={part} suppliers={suppliers} qty={qty} />
              {pricedSuppliers.length > 0 && <ComparisonChart suppliers={pricedSuppliers} qty={qty} bestIds={bestIds} />}
            </div>
          </>
        )}
      </div>

      <Footer refreshedAt={refreshedAt} />

      {toast && (
        <div
          className={'toast' + (toast.kind === 'err' ? ' error' : '')}
          role={toast.kind === 'err' ? 'alert' : 'status'}
          aria-live={toast.kind === 'err' ? 'assertive' : 'polite'}
        >
          <Icon name={toast.kind === 'err' ? 'alert' : 'check'} size={14} aria-hidden="true" />
          <span>{toast.msg}</span>
          <button
            type="button"
            className="toast-close"
            aria-label="關閉通知"
            onClick={() => setToast(null)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageContent />
    </Suspense>
  );
}
