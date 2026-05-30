'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useState, useRef, useEffect } from 'react';
import { Icon } from './Icon';

interface Props {
  apiOnline: boolean;
  liveSourceCount: number;
  totalSourceCount: number;
}

export function Header({ apiOnline, liveSourceCount, totalSourceCount }: Props) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';
  const initials = session?.user?.name
    ? session.user.name.slice(0, 2).toUpperCase()
    : '??';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <header className="hdr">
      <Link href="/" className="hdr-brand" style={{ textDecoration: 'none', color: 'inherit' }}>
        <div className="mark">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="6" width="12" height="12" rx="1" />
            <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
          </svg>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="22" height="18" viewBox="0 0 56 46" fill="none">
            <circle cx="13" cy="10" r="10" fill="#CC2200" />
            <circle cx="38" cy="19" r="7" fill="#CC2200" />
            <line x1="13" y1="10" x2="38" y2="19" stroke="#CC2200" strokeWidth="4" strokeLinecap="round" />
            <line x1="13" y1="10" x2="20" y2="36" stroke="#CC2200" strokeWidth="4" strokeLinecap="round" />
            <circle cx="20" cy="38" r="5" fill="#CC2200" />
          </svg>
          <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '0.06em', color: '#1a1a1a' }}>YAS</span>
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
        <Link href="/demand-forecast" className={'hdr-nav-link' + (pathname === '/demand-forecast' ? ' active' : '')}>
          <Icon name="trend" size={14} /><span className="lbl">需求預測</span>
        </Link>
        {isAdmin && (
          <Link href="/admin/users" className={'hdr-nav-link' + (pathname.startsWith('/admin') ? ' active' : '')}>
            <Icon name="bell" size={14} /><span className="lbl">使用者管理</span>
          </Link>
        )}
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
        {/* Avatar with dropdown menu */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <div
            className="avatar"
            onClick={() => setMenuOpen(o => !o)}
            style={{ cursor: 'pointer' }}
            title={session?.user?.email ?? ''}
          >
            {initials}
          </div>
          {menuOpen && (
            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-pop)', minWidth: 180, zIndex: 999, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--hairline)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{session?.user?.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{session?.user?.email}</div>
              </div>
              <Link
                href="/account/change-password"
                onClick={() => setMenuOpen(false)}
                style={{ display: 'block', padding: '9px 14px', fontSize: 13, color: 'var(--text-2)', textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                變更密碼
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                style={{ display: 'block', width: '100%', padding: '9px 14px', fontSize: 13, color: 'var(--danger)', textAlign: 'left', background: 'none', border: 'none', borderTop: '1px solid var(--hairline)', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#FFF0F0')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                登出
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
