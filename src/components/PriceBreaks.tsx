'use client';
import { useEffect, useId, useState } from 'react';
import { Icon } from './Icon';
import type { Supplier } from '@/lib/part-types';

const fmtNum = (n: number) => n.toLocaleString('en-US');
const fmtPrice = (n: number) => `$${n.toFixed(4)}`;

const CURRENCY_SYMBOL: Record<string, string> = { CNY: '¥', USD: '$', HKD: 'HK$', EUR: '€', JPY: '¥', TWD: 'NT$' };
const fmtAltPrice = (n: number, currency: string) =>
  `${CURRENCY_SYMBOL[currency] ?? `${currency} `}${n.toFixed(4)}`;

function escapeCsvCell(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

interface Props {
  suppliers: Supplier[];
  activeId: string;
  onTab: (id: string) => void;
  qty: number;
  onQtyChange: (q: number) => void;
  mpn: string;
  onExported?: (supplierName: string) => void;
}

export function PriceBreaks({ suppliers, activeId, onTab, qty, onQtyChange, mpn, onExported }: Props) {
  const s = suppliers.find((x) => x.id === activeId) ?? suppliers[0];
  const qtyInputId = useId();
  const [qtyDraft, setQtyDraft] = useState(() => String(qty));

  useEffect(() => {
    setQtyDraft(String(qty));
  }, [qty]);

  if (!s || s.breaks.length === 0) return null;

  const effectiveQty = s.stock > 0 && qty > s.stock ? s.stock : qty;

  const handleDraftChange = (value: string) => {
    const cleaned = value.replace(/[^\d,]/g, '');
    setQtyDraft(cleaned);
    const parsed = Number(cleaned.replace(/,/g, ''));
    if (Number.isFinite(parsed) && parsed > 0) {
      onQtyChange(Math.round(parsed));
    }
  };

  const handleDraftBlur = () => {
    const parsed = Number(qtyDraft.replace(/,/g, ''));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setQtyDraft(String(qty));
    } else {
      const normalized = Math.round(parsed);
      setQtyDraft(String(normalized));
      if (normalized !== qty) onQtyChange(normalized);
    }
  };

  const handleExportCsv = () => {
    const rows: (string | number)[][] = [['MPN', '供應商', '幣別', '數量門檻', '單價']];
    for (const b of s.breaks) {
      rows.push([mpn, s.name, s.currency, b.qty, b.price.toFixed(4)]);
    }
    if (s.altCurrency && s.altBreaks?.length) {
      for (const b of s.altBreaks) {
        rows.push([mpn, `${s.name} (Local)`, s.altCurrency, b.qty, b.price.toFixed(4)]);
      }
    }
    const csvContent = '\uFEFF' + rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const safeMpn = (mpn || 'part').replace(/[^A-Za-z0-9._-]+/g, '_');
    anchor.href = url;
    anchor.download = `${safeMpn}-${s.id}-price-breaks.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    onExported?.(s.name);
  };

  return (
    <div className="card">
      <div className="card-hd">
        <h3>
          <Icon name="trend" size={14} /> 階梯價 <span className="sub">— 依數量對應單價</span>
        </h3>
        <div className="actions">
          <label className="qty-manual" htmlFor={qtyInputId}>
            <span>數量</span>
            <input
              id={qtyInputId}
              className="mono"
              type="text"
              inputMode="numeric"
              pattern="[0-9,]*"
              value={qtyDraft}
              onChange={(e) => handleDraftChange(e.target.value)}
              onBlur={handleDraftBlur}
            />
          </label>
          <button type="button" className="btn ghost" onClick={handleExportCsv}>
            <Icon name="download" size={12} /> 匯出 CSV
          </button>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="供應商階梯價切換">
        {suppliers.map((sp) => {
          const isSelected = sp.id === s.id;
          return (
            <button
              key={sp.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={'tab' + (isSelected ? ' active' : '')}
              onClick={() => onTab(sp.id)}
            >
              {sp.name}
              <span className="ct mono">{fmtPrice(sp.breaks[0].price)}</span>
            </button>
          );
        })}
      </div>
      <div className="brk-grid">
        {s.breaks.map((b, i) => {
          const save = i === 0 ? 0 : ((s.breaks[0].price - b.price) / s.breaks[0].price) * 100;
          const nextBreak = s.breaks[i + 1]?.qty ?? Number.POSITIVE_INFINITY;
          const active = effectiveQty >= b.qty && effectiveQty < nextBreak;
          return (
            <button
              key={b.qty}
              type="button"
              className={'brk-cell' + (active ? ' active' : '')}
              onClick={() => onQtyChange(b.qty)}
            >
              <span className="qty">數量 ≥ {fmtNum(b.qty)}</span>
              <span className="price">{fmtPrice(b.price)}</span>
              {save > 0 ? (
                <span className="save">−{save.toFixed(1)}%</span>
              ) : (
                <span className="save" style={{ visibility: 'hidden' }}>—</span>
              )}
            </button>
          );
        })}
      </div>
      {s.altCurrency && s.altBreaks?.length ? (
        <>
          {/* 第二幣別獨立一列：同一站別的當地報價，不是匯率換算，不與美金混在同一格 */}
          <div className="brk-row-label">
            {s.altCurrency} 人民幣參考價 <span className="sub">— DigiKey 當地站別報價，非匯率換算</span>
          </div>
          <div className="brk-grid brk-grid-alt">
            {s.altBreaks.map((b, i, arr) => {
              const nextBreak = arr[i + 1]?.qty ?? Number.POSITIVE_INFINITY;
              const active = effectiveQty >= b.qty && effectiveQty < nextBreak;
              return (
                <button
                  key={b.qty}
                  type="button"
                  className={'brk-cell' + (active ? ' active' : '')}
                  onClick={() => onQtyChange(b.qty)}
                >
                  <span className="qty">數量 ≥ {fmtNum(b.qty)}</span>
                  <span className="price">{fmtAltPrice(b.price, s.altCurrency!)}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
