'use client';
import { useEffect, useMemo, useState } from 'react';
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
import {
  PART_DATA,
  SUPPLIERS,
  priceAtQty,
  type PartInfo,
  type Supplier,
} from '@/lib/mockData';

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
  variations?: ApiVariation[];
  marketplaceVariations?: ApiMarketplaceVariation[];
  productUrl: string;
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
    : [{ qty: 1, price: result.unitPrice ?? 0 }];
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
    productUrl: result.productUrl,
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

function partOverrideFromResult(result: ApiPartResult): Partial<PartInfo> {
  return {
    mpn: result.manufacturerPartNumber || PART_DATA.mpn,
    manufacturer: result.manufacturer || PART_DATA.manufacturer,
    description: result.description || PART_DATA.description,
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

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [part, setPart] = useState<PartInfo>(PART_DATA);
  const [suppliers, setSuppliers] = useState<Supplier[]>(SUPPLIERS);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('unitPrice');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [activeTab, setActiveTab] = useState('digikey');
  const [qtyInput, setQtyInput] = useState('');
  const [qty, setQty] = useState(1);
  const [selectedRow, setSelectedRow] = useState<string | null>('digikey');
  const [hasSearched, setHasSearched] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string>(formatTimeUTC(new Date()));

  const liveCount = useMemo(() => suppliers.filter((s) => s.isLive).length, [suppliers]);
  const totalCount = suppliers.length;

  const sorted = useMemo(() => {
    const arr = [...suppliers];
    arr.sort((a, b) => {
      if (a.status === 'restricted' && b.status !== 'restricted') return 1;
      if (a.status !== 'restricted' && b.status === 'restricted') return -1;
      const av = sortKey === 'unitPrice' ? priceAtQty(a, qty) : (a as unknown as Record<string, unknown>)[sortKey];
      const bv = sortKey === 'unitPrice' ? priceAtQty(b, qty) : (b as unknown as Record<string, unknown>)[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return arr;
  }, [suppliers, sortKey, sortDir, qty]);

  const bestIds = useMemo(() => {
    const available = suppliers.filter((s) => s.status !== 'restricted' && s.stock > 0 && Number.isFinite(priceAtQty(s, qty)));
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

  const handleSearch = async (q: string) => {
    const requestedQty = Number(qtyInput.replace(/,/g, ''));
    if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
      setToast({ msg: '請輸入數量', kind: 'err' });
      return;
    }
    const normalizedQty = Math.round(requestedQty);
    setQty(normalizedQty);
    setQtyInput(String(normalizedQty));
    setLoading(true);
    try {
      const params = new URLSearchParams({ partNumber: q, suppliers: 'digikey,mouser hk,mouser vn' });
      const resp = await fetch(`/api/search?${params.toString()}`);
      const json: ApiSearchResponse = await resp.json();
      const exactResults = json.suppliers
        .map((block) => findExactResult(block, q))
        .filter((result): result is ApiPartResult => Boolean(result));
      const errors = json.suppliers.filter((b) => b.error);
      const alerts = errors.filter(shouldShowSupplierAlert);
      const restrictedRows = errors
        .filter((b) => b.error?.code === 'RESTRICTED')
        .map(restrictedSupplierFromBlock);
      const exactMissRows = json.suppliers
        .filter((block) => !block.error && !findExactResult(block, q))
        .map(notFoundSupplierFromBlock);
      const notFoundErrorRows = errors
        .filter((block) => block.error?.code === 'EMPTY_RESULT' || block.error?.code === 'NOT_FOUND')
        .map(notFoundSupplierFromBlock);
      const notFoundRows = [...exactMissRows, ...notFoundErrorRows];

      if (exactResults.length > 0 || restrictedRows.length > 0 || notFoundRows.length > 0) {
        const liveRows = exactResults.map((result) => (
          result.quantityAvailable > 0 ? supplierFromResult(result) : emptyStockSupplierFromResult(result)
        ));
        const nextSup = [...liveRows, ...restrictedRows];
        const firstResult = exactResults[0];
        const visibleRows = [...nextSup, ...notFoundRows];
        setSuppliers(visibleRows);
        setPart(firstResult ? { ...PART_DATA, ...partOverrideFromResult(firstResult) } : PART_DATA);
        setHasSearched(true);
        setSelectedRow(visibleRows[0]?.id ?? null);
        setActiveTab(liveRows[0]?.id ?? visibleRows[0]?.id ?? 'digikey');
        setToast(alerts.length > 0 ? { msg: alerts.map(friendlySupplierError).join('；'), kind: 'err' } : null);
      } else if (alerts.length > 0) {
        setToast({ msg: alerts.map(friendlySupplierError).join('；'), kind: 'err' });
      } else {
        setToast({ msg: `No data for "${q}"`, kind: 'err' });
      }
      setRefreshedAt(formatTimeUTC(new Date()));
      setQuery('');
      setQtyInput('');
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : String(e), kind: 'err' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedRow && !suppliers.some((s) => s.id === selectedRow)) {
      setSelectedRow(suppliers[0]?.id ?? null);
    }
  }, [suppliers, selectedRow]);

  return (
    <div className="app">
      <Header apiOnline={liveCount > 0} liveSourceCount={liveCount} totalSourceCount={totalCount} />
      <Hero query={query} setQuery={setQuery} qtyInput={qtyInput} setQtyInput={setQtyInput} onSearch={handleSearch} loading={loading} />
      <SubBar
        query={query}
        category={part.category}
        liveCount={liveCount}
        totalCount={totalCount}
        refreshedAt={refreshedAt}
      />

      <div className="main">
        {!hasSearched ? (
          <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--gray-400)' }}>
            <Icon name="search" size={32} />
            <p style={{ marginTop: '16px', fontSize: '15px' }}>
              請在上方輸入料號，查詢價格與庫存。
            </p>
          </div>
        ) : (
          <>
            <div className="row-2">
              <ProductCard part={part} />
              <div className="card">
                <div className="card-hd">
                  <h3>
                    <Icon name="compare" size={14} />
                    供應商比較
                    <span className="sub">— {suppliers.length} 個來源，可排序</span>
                  </h3>
                  <div className="actions">
                    <button className="btn ghost"><Icon name="filter" size={12} /> 篩選</button>
                    <button className="btn ghost"><Icon name="share" size={12} /> 分享</button>
                    <button className="btn"><Icon name="cart" size={12} /> 加入 BOM</button>
                  </div>
                </div>
                <div className="card-bd flush">
                  <SupplierTable
                    suppliers={sorted}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    bestIds={bestIds}
                    qty={qty}
                    onSelect={setSelectedRow}
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
                onQtyChange={(nextQty) => {
                  setQty(nextQty);
                  setQtyInput(String(nextQty));
                }}
              />
            )}

            <div className="row-3">
              <SpecGrid part={part} />
              {pricedSuppliers.length > 0 && <ComparisonChart suppliers={pricedSuppliers} qty={qty} bestIds={bestIds} />}
            </div>
          </>
        )}
      </div>

      <Footer liveCount={liveCount} totalCount={totalCount} refreshedAt={refreshedAt} />

      {toast && (
        <div className={'toast' + (toast.kind === 'err' ? ' error' : '')}>
          <Icon name={toast.kind === 'err' ? 'alert' : 'check'} size={14} />
          {toast.msg}
        </div>
      )}
    </div>
  );
}
