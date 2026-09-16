'use client';
import { Icon } from './Icon';
import type { Supplier } from '@/lib/mockData';

const fmtNum = (n: number) => n.toLocaleString('en-US');
const fmtPrice = (n: number) => `$${n.toFixed(4)}`;

const CURRENCY_SYMBOL: Record<string, string> = { CNY: '¥', USD: '$', HKD: 'HK$', EUR: '€', JPY: '¥', TWD: 'NT$' };
const fmtAltPrice = (n: number, currency: string) =>
  `${CURRENCY_SYMBOL[currency] ?? `${currency} `}${n.toFixed(4)}`;

interface Props {
  suppliers: Supplier[];
  activeId: string;
  onTab: (id: string) => void;
  qty: number;
  onQtyChange: (q: number) => void;
}

export function PriceBreaks({ suppliers, activeId, onTab, qty, onQtyChange }: Props) {
  const s = suppliers.find((x) => x.id === activeId) ?? suppliers[0];
  // 第二幣別是同一個站別的當地報價，不是匯率換算，所以只對齊級距顯示、不參與比價
  const altByQty = new Map((s.altBreaks ?? []).map((b) => [b.qty, b.price]));
  const effectiveQty = s.stock > 0 && qty > s.stock ? s.stock : qty;
  const updateQty = (value: string) => {
    const next = Number(value.replace(/,/g, ''));
    onQtyChange(Number.isFinite(next) && next > 0 ? Math.round(next) : 1);
  };
  return (
    <div className="card">
      <div className="card-hd">
        <h3>
          <Icon name="trend" size={14} /> 階梯價{' '}
          <span className="sub">
            — 依數量對應單價
            {s.altCurrency ? `；${s.altCurrency} 為 DigiKey 當地站別報價，非匯率換算` : ''}
          </span>
        </h3>
        <div className="actions">
          <label className="qty-manual">
            <span>數量</span>
            <input
              className="mono"
              type="number"
              min="1"
              step="1"
              value={qty}
              onChange={(e) => updateQty(e.target.value)}
            />
          </label>
          <button className="btn ghost"><Icon name="download" size={12} /> 匯出 CSV</button>
        </div>
      </div>
      <div className="tabs">
        {suppliers.map((sp) => (
          <div
            key={sp.id}
            className={'tab' + (sp.id === activeId ? ' active' : '')}
            onClick={() => onTab(sp.id)}
          >
            {sp.name}
            <span className="ct mono">{fmtPrice(sp.breaks[0].price)}</span>
          </div>
        ))}
      </div>
      <div className="brk-grid">
        {s.breaks.map((b, i) => {
          const save = i === 0 ? 0 : ((s.breaks[0].price - b.price) / s.breaks[0].price) * 100;
          const nextBreak = s.breaks[i + 1]?.qty ?? Number.POSITIVE_INFINITY;
          const active = effectiveQty >= b.qty && effectiveQty < nextBreak;
          return (
            <div
              key={b.qty}
              className={'brk-cell' + (active ? ' active' : '')}
              onClick={() => onQtyChange(b.qty)}
            >
              <div className="qty">數量 ≥ {fmtNum(b.qty)}</div>
              <div className="price">{fmtPrice(b.price)}</div>
              {s.altCurrency && altByQty.has(b.qty) ? (
                <div className="price-alt mono">{fmtAltPrice(altByQty.get(b.qty)!, s.altCurrency)}</div>
              ) : null}
              {save > 0 ? (
                <div className="save">−{save.toFixed(1)}%</div>
              ) : (
                <div className="save" style={{ visibility: 'hidden' }}>—</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
