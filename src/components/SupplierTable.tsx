'use client';
import { useState } from 'react';
import { Icon } from './Icon';
import { priceAtQty, type Supplier, type MarketplaceInfo } from '@/lib/mockData';

export type SortKey = 'name' | 'stock' | 'moq' | 'leadDays' | 'unitPrice' | 'updatedSec';
export type SortDir = 'asc' | 'desc';

const fmtNum = (n: number) => n.toLocaleString('en-US');
const fmtPrice = (n: number) => `$${n.toFixed(4)}`;
const fmtMaybePrice = (n: number) => Number.isFinite(n) ? fmtPrice(n) : '—';
const breakTitle = (s: Supplier) =>
  s.breaks.length
    ? s.breaks.map((b) => `數量 >= ${fmtNum(b.qty)}: ${s.currency} ${b.price.toFixed(4)}`).join('\n')
    : '';

interface Props {
  suppliers: Supplier[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  bestIds: string[];
  qty: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function SupplierTable({ suppliers, sortKey, sortDir, onSort, bestIds, qty, selectedId, onSelect }: Props) {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const cols: { k: SortKey | '_act' | 'demand' | 'quote' | 'total' | 'status'; label: string; num?: boolean; sortable?: boolean }[] = [
    { k: 'name', label: '供應商' },
    { k: 'demand', label: '需求', num: true, sortable: false },
    { k: 'stock', label: '庫存', num: true },
    { k: 'moq', label: 'MPQ', num: true },
    { k: 'quote', label: '報價明細', sortable: false },
    { k: 'total', label: '總價', num: true, sortable: false },
    { k: 'unitPrice', label: `平均單價\n@${fmtNum(qty)}`, num: true },
    { k: 'status', label: '狀態', sortable: false },
    { k: '_act', label: '' },
  ];
  const maxStock = Math.max(...suppliers.map((s) => s.stock), 1);
  const bestSupplier = bestIds.length ? suppliers.find((s) => s.id === bestIds[0]) : null;

  return (
    <>
    <table className="tbl">
      <thead>
        <tr>
          {cols.map((c) => (
            <th
              key={c.k}
              className={(c.num ? 'num ' : '') + (sortKey === c.k ? 'sorted' : '')}
              onClick={() => c.k !== '_act' && c.sortable !== false && onSort(c.k as SortKey)}
            >
              <span className="sort">
                <span className="sort-label">
                  {c.label.split('\n').map((line) => <span key={line}>{line}</span>)}
                </span>
                {sortKey === c.k && (
                  <span className="arrow">
                    <Icon name={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'} size={11} />
                  </span>
                )}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {suppliers.map((s) => {
          const isRestricted = s.status === 'restricted';
          const isNotFound = s.status === 'notfound';
          const isUnavailable = isRestricted || isNotFound;
          const isBest = bestIds.includes(s.id);
          const stockPct = (s.stock / maxStock) * 100;
          const unitPriceAtQty = priceAtQty(s, qty);
          const bestPriceAtQty = bestSupplier ? priceAtQty(bestSupplier, qty) : 0;
          const effectiveQty = s.stock > 0 && qty > s.stock ? s.stock : qty;
          const totalCost = Number.isFinite(unitPriceAtQty) ? unitPriceAtQty * effectiveQty : null;
          const noStock = !isUnavailable && s.stock <= 0;
          const shortage = !isUnavailable && s.stock > 0 && s.stock < qty;
          const hasExternalStock = (s.marketplaceVariations?.length ?? 0) > 0;
          const vsBest =
            isBest || !bestSupplier || isUnavailable || noStock || bestPriceAtQty <= 0 || !Number.isFinite(unitPriceAtQty)
              ? 0
              : ((unitPriceAtQty - bestPriceAtQty) / bestPriceAtQty) * 100;
          return (
            <tr
              key={s.id}
              className={(isBest ? 'best ' : '') + (isRestricted ? 'restricted ' : '') + (selectedId === s.id ? 'sel' : '')}
              onClick={() => onSelect(s.id)}
            >
              <td>
                <div className="supp-cell">
                  <div className="supp-logo">{s.name.slice(0, 2).toUpperCase()}</div>
                  <div>
                    <div className="supp-name">
                      {s.name}
                      {s.isLive ? (
                        <span className="live-flag">即時</span>
                      ) : (
                        <span className="demo-flag">示範</span>
                      )}
                    </div>
                    <div className="supp-region">
                      <Icon name="globe" size={9} style={{ verticalAlign: 'middle' }} /> {s.region}
                    </div>
                  </div>
                </div>
              </td>
              <td className="num center-cell demand-cell">{fmtNum(qty)}</td>
              <td className="num center-cell">
                {isUnavailable ? (
                  <span className="dash">—</span>
                ) : (
                  <div className="stock-bar">
                    <div className="num">{fmtNum(s.stock)}</div>
                    <div className="track">
                      <div className={'fill' + (s.stock < 2000 ? ' low' : '')} style={{ width: stockPct + '%' }}></div>
                    </div>
                    {s.marketplaceVariations?.map((mv: MarketplaceInfo, i: number) => (
                      <div key={i} style={{ marginTop: 4, fontSize: 10, color: '#b45309', lineHeight: 1.3 }}>
                        <span title="商城產品（外部供應商）">🏪</span> {fmtNum(mv.stockQty)}
                        <div style={{ color: '#888', fontSize: 9.5 }}>{mv.supplierName}</div>
                        <div style={{ color: '#888', fontSize: 9.5 }}>MOQ {fmtNum(mv.minQty)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </td>
              <td className="num center-cell">{isUnavailable ? <span className="dash">—</span> : (s.mpq ?? s.moq)}</td>
              <td className="center-cell">
                {isUnavailable ? (
                  <span className="dash">—</span>
                ) : (
                  <div
                    className="quote-cell price-hover"
                    onMouseEnter={(e) => setTooltip({ text: breakTitle(s), x: e.clientX, y: e.clientY })}
                    onMouseMove={(e) => setTooltip({ text: breakTitle(s), x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    <div className="v"><span className="cur">{s.currency}</span> {Number.isFinite(unitPriceAtQty) ? unitPriceAtQty.toFixed(4) : '—'}</div>
                    <div className="d">{noStock ? '沒有庫存' : `依 ${fmtNum(effectiveQty)} pcs`}</div>
                  </div>
                )}
              </td>
              <td className="num center-cell">
                {totalCost != null ? (
                  <span className="total-price">{fmtPrice(totalCost)}</span>
                ) : (
                  <span className="dash">—</span>
                )}
              </td>
              <td className="num center-cell">
                {isRestricted ? (
                  <span className="restricted-text">供貨限制</span>
                ) : isNotFound ? (
                  <span className="dash">—</span>
                ) : (
                  <div
                    className={'price-cell price-hover' + (isBest ? ' best' : '')}
                    onMouseEnter={(e) => setTooltip({ text: breakTitle(s), x: e.clientX, y: e.clientY })}
                    onMouseMove={(e) => setTooltip({ text: breakTitle(s), x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    <div className="pri">{fmtMaybePrice(unitPriceAtQty)}</div>
                    <div className={'vs' + (isBest ? '' : ' up')}>
                      {noStock ? '沒有庫存' : isBest ? '最低單價' : `+${vsBest.toFixed(1)}%`}
                    </div>
                  </div>
                )}
              </td>
              <td>
                <div className="status-cell">
                  {isRestricted ? (
                    <span className="restricted-flag">供貨限制</span>
                  ) : isNotFound ? (
                    <span className="fulfill-flag notfound">平台沒有這顆料</span>
                  ) : noStock ? (
                    <span className="fulfill-flag none">沒有庫存</span>
                  ) : shortage ? (
                    <span className="fulfill-flag partial">{hasExternalStock ? '部分滿足/外部庫存' : '部分滿足'}</span>
                  ) : (
                    <span className="fulfill-flag full">{hasExternalStock ? '完全滿足/外部庫存' : '完全滿足'}</span>
                  )}
                </div>
              </td>
              <td>
                <div className="row-actions">
                  <button className="icon-btn" title="加入採購車" onClick={(e) => e.stopPropagation()}>
                    <Icon name="cart" size={13} />
                  </button>
                  {s.productUrl ? (
                    <a
                      className="icon-btn"
                      title="打開供應商頁面"
                      href={s.productUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Icon name="external" size={13} />
                    </a>
                  ) : (
                    <button className="icon-btn" title="打開供應商頁面" onClick={(e) => e.stopPropagation()}>
                      <Icon name="external" size={13} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    {tooltip?.text && (
      <span
        className="price-tooltip is-fixed"
        style={{
          left: Math.min(tooltip.x + 14, window.innerWidth - 280),
          top: Math.min(Math.max(tooltip.y - 80, 12), window.innerHeight - 220),
        }}
      >
        {tooltip.text}
      </span>
    )}
    </>
  );
}
