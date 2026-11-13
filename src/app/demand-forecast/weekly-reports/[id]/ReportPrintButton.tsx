'use client';

import { Icon } from '@/components/Icon';

export function ReportPrintButton() {
  return (
    <button
      type="button"
      className="weekly-report-nav-btn weekly-report-print-btn"
      onClick={() => window.print()}
      title="開啟瀏覽器列印視窗，可印出紙本或另存為 PDF"
    >
      <Icon name="printer" size={14} stroke={2} />
      <span>列印 / 匯出 PDF</span>
    </button>
  );
}
