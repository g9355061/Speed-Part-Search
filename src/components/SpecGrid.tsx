'use client';
import { Icon } from './Icon';
import { priceAtQty, type PartInfo, type Supplier } from '@/lib/part-types';

interface Props {
  part: PartInfo;
  suppliers: Supplier[];
  qty: number;
}

const fmtNum = (n: number) => n.toLocaleString('en-US');

export function SpecGrid({ part, suppliers, qty }: Props) {
  const activeSuppliers = suppliers.filter((s) => s.status !== 'notfound' && s.status !== 'restricted');
  const stockedSuppliers = activeSuppliers.filter((s) => s.stock > 0);
  const totalStock = stockedSuppliers.reduce((sum, s) => sum + s.stock, 0);

  const moqCandidates = activeSuppliers.map((s) => s.moq).filter((m) => Number.isFinite(m) && m > 0);
  const minMoq = moqCandidates.length > 0 ? Math.min(...moqCandidates) : null;

  const leadCandidates = activeSuppliers
    .filter((s) => s.stock > 0 || s.breaks.length > 0)
    .map((s) => s.leadDays)
    .filter((d) => Number.isFinite(d) && d > 0);
  const minLeadDays = leadCandidates.length > 0 ? Math.min(...leadCandidates) : null;

  const pricedAtQty = stockedSuppliers
    .map((s) => {
      const effectiveQty = Math.min(qty, s.stock);
      const unitPrice = priceAtQty(s, effectiveQty);
      return Number.isFinite(unitPrice) ? { name: s.name, unitPrice } : null;
    })
    .filter((x): x is { name: string; unitPrice: number } => x !== null)
    .sort((a, b) => a.unitPrice - b.unitPrice);

  const bestQuote = pricedAtQty[0] ?? null;

  const items: { lbl: string; val: string; ic: 'zap' | 'package' | 'thermo' | 'check' | 'circuit' }[] = [
    { lbl: '製造商料號', val: part.mpn, ic: 'circuit' },
    { lbl: '製造商', val: part.manufacturer || '—', ic: 'package' },
    { lbl: '分類 / 環保', val: [part.category, part.rohsStatus].filter(Boolean).join(' · ') || '—', ic: 'check' },
    { lbl: '生命週期 / 狀態', val: part.lifecycle || '—', ic: 'check' },
    {
      lbl: '可出貨總庫存',
      val: totalStock > 0 ? `${fmtNum(totalStock)} pcs（${stockedSuppliers.length} 家）` : '無現貨',
      ic: 'package',
    },
    { lbl: '最低 MPQ / MOQ', val: minMoq !== null ? `${fmtNum(minMoq)} pcs` : '—', ic: 'zap' },
    {
      lbl: `最低平均單價 @${fmtNum(qty)}`,
      val: bestQuote ? `$${bestQuote.unitPrice.toFixed(4)}（${bestQuote.name}）` : '—',
      ic: 'zap',
    },
    {
      lbl: minLeadDays !== null ? '最快參考交期' : '供應商料號 / SKU',
      val: minLeadDays !== null ? `${minLeadDays} 天` : (part.supplierPartNumber || '—'),
      ic: 'thermo',
    },
  ];

  return (
    <div className="card">
      <div className="card-hd">
        <h3>
          <Icon name="info" size={14} /> 摘要與供應統計 <span className="sub">— 依即時供應商回傳彙整</span>
        </h3>
        {part.datasheetUrl && (
          <div className="actions">
            <a
              className="btn ghost"
              href={part.datasheetUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              <Icon name="external" size={12} /> 規格書
            </a>
          </div>
        )}
      </div>
      <div className="card-bd flush">
        <div className="spec-grid">
          {items.map((it) => (
            <div key={it.lbl} className="spec-item">
              <div className="lbl"><Icon name={it.ic} size={11} />{it.lbl}</div>
              <div className="val">{it.val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
