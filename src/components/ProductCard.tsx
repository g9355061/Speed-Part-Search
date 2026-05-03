'use client';
import { Icon } from './Icon';
import type { PartInfo } from '@/lib/mockData';

export function ProductCard({ part }: { part: PartInfo }) {
  return (
    <div className="card">
      <div className="product-img">
        <div className="stripes"></div>
        <svg className="chip-svg" width="120" height="120" viewBox="0 0 120 120" fill="none">
          <rect x="30" y="30" width="60" height="60" rx="3" fill="#0B2545" />
          <rect x="34" y="34" width="52" height="52" rx="1" fill="none" stroke="#1F4D8C" strokeWidth="0.5" />
          <circle cx="40" cy="40" r="2" fill="none" stroke="#1F4D8C" />
          {[0, 1, 2, 3, 4].map((i) => <rect key={`l${i}`} x="24" y={40 + i * 10} width="6" height="3" fill="#97A0AE" />)}
          {[0, 1, 2, 3, 4].map((i) => <rect key={`r${i}`} x="90" y={40 + i * 10} width="6" height="3" fill="#97A0AE" />)}
          {[0, 1, 2, 3, 4].map((i) => <rect key={`t${i}`} x={40 + i * 10} y="24" width="3" height="6" fill="#97A0AE" />)}
          {[0, 1, 2, 3, 4].map((i) => <rect key={`b${i}`} x={40 + i * 10} y="90" width="3" height="6" fill="#97A0AE" />)}
          <text x="60" y="58" textAnchor="middle" fill="#97A0AE" fontFamily="monospace" fontSize="6">{part.mpn.slice(0, 5)}</text>
          <text x="60" y="68" textAnchor="middle" fill="#6B7787" fontFamily="monospace" fontSize="5">{part.mpn.slice(5, 13)}</text>
        </svg>
        <div className="placeholder-tag">產品示意圖</div>
      </div>
      <div className="product-meta">
        <div>
          <div className="mpn">{part.mpn}</div>
          <div className="mfr">{part.manufacturer}</div>
        </div>
        <div className="desc">{part.description}</div>
        <div className="pills">
          <span className="pill"><Icon name="package" size={11} /> {part.package}</span>
          {part.rohs && <span className="pill success"><Icon name="check" size={11} /> RoHS</span>}
          <span className="pill primary">{part.lifecycle}</span>
          <span className="pill">REACH</span>
        </div>
      </div>
      <div className="product-actions">
        <button className="btn"><Icon name="file" size={13} /> 規格書</button>
        <button className="btn solid"><Icon name="bookmark" size={13} /> 追蹤</button>
      </div>
    </div>
  );
}
