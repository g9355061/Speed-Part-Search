'use client';
import { Icon } from './Icon';
import type { PartInfo } from '@/lib/mockData';

export function SpecGrid({ part }: { part: PartInfo }) {
  const items: { lbl: string; val: string; ic: 'zap' | 'package' | 'thermo' | 'check' | 'circuit' }[] = [
    { lbl: '電壓', val: part.voltage, ic: 'zap' },
    { lbl: '封裝', val: part.package, ic: 'package' },
    { lbl: '溫度範圍', val: part.tempRange, ic: 'thermo' },
    { lbl: '生命週期', val: part.lifecycle, ic: 'check' },
    { lbl: 'Flash', val: part.flash, ic: 'circuit' },
    { lbl: 'SRAM', val: part.sram, ic: 'circuit' },
    { lbl: '速度', val: part.speed, ic: 'zap' },
    { lbl: 'I/O 腳位', val: String(part.io), ic: 'circuit' },
  ];
  return (
    <div className="card">
      <div className="card-hd">
        <h3>
          <Icon name="info" size={14} /> 規格摘要 <span className="sub">— 依供應商資料整理</span>
        </h3>
        <div className="actions">
          <button className="btn ghost"><Icon name="external" size={12} /> 規格書</button>
        </div>
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
