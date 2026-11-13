'use client';
import { Icon } from './Icon';
import type { PartInfo } from '@/lib/part-types';

interface Props {
  part: PartInfo;
  matchedCount: number;
  totalCount: number;
}

export function ProductCard({ part, matchedCount, totalCount }: Props) {
  return (
    <div className="card">
      <div className="product-img">
        <div className="stripes"></div>
        <svg className="chip-svg" width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden="true">
          <rect x="30" y="30" width="60" height="60" rx="3" fill="#0B2545" />
          <rect x="34" y="34" width="52" height="52" rx="1" fill="none" stroke="#1F4D8C" strokeWidth="0.5" />
          <circle cx="40" cy="40" r="2" fill="none" stroke="#1F4D8C" />
          {[0, 1, 2, 3, 4].map((i) => <rect key={`l${i}`} x="24" y={40 + i * 10} width="6" height="3" fill="#97A0AE" />)}
          {[0, 1, 2, 3, 4].map((i) => <rect key={`r${i}`} x="90" y={40 + i * 10} width="6" height="3" fill="#97A0AE" />)}
          {[0, 1, 2, 3, 4].map((i) => <rect key={`t${i}`} x={40 + i * 10} y="24" width="3" height="6" fill="#97A0AE" />)}
          {[0, 1, 2, 3, 4].map((i) => <rect key={`b${i}`} x={40 + i * 10} y="90" width="3" height="6" fill="#97A0AE" />)}
          <text x="60" y="58" textAnchor="middle" fill="#97A0AE" fontFamily="monospace" fontSize="6">{part.mpn.slice(0, 6)}</text>
          <text x="60" y="68" textAnchor="middle" fill="#6B7787" fontFamily="monospace" fontSize="5">{part.mpn.slice(6, 15)}</text>
        </svg>
        <div className="placeholder-tag">產品示意圖</div>
      </div>
      <div className="product-meta">
        <div>
          <div className="mpn">{part.mpn}</div>
          <div className="mfr">{part.manufacturer || '—'}</div>
        </div>
        <div className="desc">{part.description || '供應商未提供詳細描述'}</div>
        <div className="pills">
          {part.category && (
            <span className="pill"><Icon name="package" size={11} /> {part.category}</span>
          )}
          {part.rohsStatus && (
            <span className="pill success"><Icon name="check" size={11} /> {part.rohsStatus}</span>
          )}
          {part.lifecycle && (
            <span className="pill primary">{part.lifecycle}</span>
          )}
          <span className="pill">來源 {matchedCount}/{totalCount}</span>
        </div>
      </div>
      {(part.datasheetUrl || part.primaryProductUrl) && (
        <div className="product-actions">
          {part.datasheetUrl && (
            <a
              className="btn"
              href={part.datasheetUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              <Icon name="file" size={13} /> 規格書
            </a>
          )}
          {part.primaryProductUrl && (
            <a
              className="btn solid"
              href={part.primaryProductUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              <Icon name="external" size={13} /> 供應商頁面
            </a>
          )}
        </div>
      )}
    </div>
  );
}
