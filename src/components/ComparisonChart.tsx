'use client';
import { Icon } from './Icon';
import { priceAtQty, type Supplier } from '@/lib/mockData';

const fmtNum = (n: number) => n.toLocaleString('en-US');
const fmtPrice = (n: number) => `$${n.toFixed(4)}`;

interface Props {
  suppliers: Supplier[];
  qty: number;
  bestIds: string[];
}

export function ComparisonChart({ suppliers, qty, bestIds }: Props) {
  const prices = suppliers.map((s) => priceAtQty(s, qty)).filter(Number.isFinite);
  const max = Math.max(...prices);
  const min = Math.min(...prices);
  return (
    <div className="card">
      <div className="card-hd">
        <h3>
          <Icon name="trend" size={14} /> 單價比較 <span className="sub">@ 數量 {fmtNum(qty)}</span>
        </h3>
        <div className="actions">
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-4)' }}>USD</span>
        </div>
      </div>
      <div className="card-bd chart-card">
        <div className="chart-bars">
          {suppliers.map((s) => {
            const p = priceAtQty(s, qty);
            if (!Number.isFinite(p)) return null;
            const w = ((p - min * 0.85) / (max - min * 0.85 || 1)) * 100;
            const isBest = bestIds.includes(s.id);
            return (
              <div key={s.id} className={'chart-row' + (isBest ? ' best' : '')}>
                <div className="name">{s.name}</div>
                <div className="bar">
                  <div className="fill" style={{ width: Math.max(w, 8) + '%' }}></div>
                </div>
                <div className="pri">{fmtPrice(p)}</div>
              </div>
            );
          })}
        </div>
        <div className="chart-legend">
          <div className="item lowest-legend"><span className="sw" style={{ background: 'var(--accent)' }}></span> 最低單價</div>
          <div className="item"><span className="sw" style={{ background: 'var(--primary-3)' }}></span> 其他供應商</div>
          <div className="item" style={{ marginLeft: 'auto' }}>
            <Icon name="info" size={11} /> 未含運費與稅金
          </div>
        </div>
      </div>
    </div>
  );
}
