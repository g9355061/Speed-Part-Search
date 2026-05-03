'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './Icon';

interface Props {
  apiOnline: boolean;
  liveSourceCount: number;
  totalSourceCount: number;
}

export function Header({ apiOnline, liveSourceCount, totalSourceCount }: Props) {
  const pathname = usePathname();
  return (
    <header className="hdr">
      <Link href="/" className="hdr-brand" style={{ textDecoration: 'none', color: 'inherit' }}>
        <div className="mark">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="6" width="12" height="12" rx="1" />
            <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
          </svg>
        </div>
        <div className="name">SpeedPart<span className="dot">.</span></div>
      </Link>

      <nav className="hdr-nav">
        <Link href="/" className={'hdr-nav-link' + (pathname === '/' ? ' active' : '')}>
          <Icon name="search" size={14} /><span className="lbl">單料查詢</span>
        </Link>
        <Link href="/batch" className={'hdr-nav-link' + (pathname === '/batch' ? ' active' : '')}>
          <Icon name="compare" size={14} /><span className="lbl">BOM Batch</span>
        </Link>
        <Link href="/batch-manufacturer" className={'hdr-nav-link' + (pathname === '/batch-manufacturer' ? ' active' : '')}>
          <Icon name="compare" size={14} /><span className="lbl">BOM Batch - MFR</span>
        </Link>
        <Link href="/manufacturer-mapping" className={'hdr-nav-link' + (pathname === '/manufacturer-mapping' ? ' active' : '')}>
          <Icon name="compare" size={14} /><span className="lbl">廠商對照表</span>
        </Link>
      </nav>

      <div className="hdr-right">
        <div className="hdr-search-wrap">
          <Icon name="search" size={14} />
          <input className="hdr-search mono" placeholder="快速查詢…" />
        </div>
        <span className={'api-pill' + (apiOnline ? '' : ' offline')}>
          <span className="dot"></span>
          API · {liveSourceCount}/{totalSourceCount} 來源 {apiOnline ? '在線' : '離線'}
        </span>
        <button className="icon-btn" title="通知">
          <Icon name="bell" size={16} />
          <span className="badge"></span>
        </button>
        <div className="avatar">JL</div>
      </div>
    </header>
  );
}
