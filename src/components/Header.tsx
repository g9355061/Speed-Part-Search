'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useState, useRef, useEffect, useId, useCallback, type FormEvent } from 'react';
import { Icon } from './Icon';
import { BrandLogo } from './BrandLogo';
import { canAccessQqInquiry } from '@/lib/permissions';

interface NavItem {
  href: string;
  label: string;
  icon: 'search' | 'compare' | 'message' | 'layers' | 'trend' | 'users';
  matchPrefix?: boolean;
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';
  const canUseQqInquiry = canAccessQqInquiry(session?.user);
  const initials = session?.user?.name
    ? session.user.name.slice(0, 2).toUpperCase()
    : '??';

  const quickSearchId = useId();
  const drawerQuickSearchId = useId();
  const drawerId = useId();

  const [quickQuery, setQuickQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const hasBeenVisibleRef = useRef(false);
  const isClosingRef = useRef(false);

  const navItems: NavItem[] = [
    { href: '/', label: '單料查詢', icon: 'search' },
    { href: '/batch-manufacturer', label: 'BOM Batch', icon: 'compare' },
    ...(canUseQqInquiry ? [{ href: '/qq-inquiry', label: 'QQ詢價', icon: 'message' as const }] : []),
    { href: '/manufacturer-mapping', label: '廠商對照表', icon: 'layers' },
    ...(isAdmin ? [
      { href: '/demand-forecast', label: '缺料預測', icon: 'trend' as const, matchPrefix: true },
      { href: '/admin/users', label: '使用者管理', icon: 'users' as const, matchPrefix: true },
    ] : []),
  ];

  const isNavActive = (item: NavItem) =>
    item.matchPrefix ? pathname.startsWith(item.href) : pathname === item.href;

  // Close avatar dropdown on outside click or Escape
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const closeDrawer = useCallback(() => {
    const dialog = drawerRef.current;
    const scroller = scrollerRef.current;
    if (!dialog?.open) return;
    isClosingRef.current = true;
    if (scroller && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      scroller.scrollTo({ left: scroller.offsetWidth, behavior: 'auto' });
    } else {
      dialog.close();
      setDrawerOpen(false);
      isClosingRef.current = false;
      hasBeenVisibleRef.current = false;
    }
  }, []);

  const openDrawer = useCallback(async () => {
    const dialog = drawerRef.current;
    const scroller = scrollerRef.current;
    if (!dialog || !scroller || dialog.open) return;

    hasBeenVisibleRef.current = false;
    isClosingRef.current = false;
    setMenuOpen(false);
    dialog.showModal();

    if (!CSS.supports('scroll-initial-target', 'nearest')) {
      scroller.scrollTo({ left: scroller.offsetWidth, behavior: 'instant' as ScrollBehavior });
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );
    }

    if (dialog.open) {
      scroller.scrollTo({ left: 0, behavior: 'auto' });
    }
  }, []);

  // Navigation drawer IntersectionObserver, backdrop scroll fallback, and cancel/resize handling
  useEffect(() => {
    const dialog = drawerRef.current;
    const scroller = scrollerRef.current;
    const sheet = sheetRef.current;
    if (!dialog || !scroller || !sheet) return;

    const onDrawerOpened = () => {
      hasBeenVisibleRef.current = true;
      setDrawerOpen(true);
    };

    const onDrawerClosed = () => {
      if (dialog.open) dialog.close();
      hasBeenVisibleRef.current = false;
      isClosingRef.current = false;
      setDrawerOpen(false);
    };

    const visibleThreshold = Math.min(0.05, 1 / Math.max(window.innerWidth, 320));
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry || !dialog.open) return;
        if (entry.intersectionRatio >= 0.99) {
          onDrawerOpened();
        } else if (entry.intersectionRatio < visibleThreshold && (hasBeenVisibleRef.current || isClosingRef.current)) {
          onDrawerClosed();
        } else if (entry.intersectionRatio > visibleThreshold) {
          hasBeenVisibleRef.current = true;
        }
      },
      { root: dialog, threshold: [visibleThreshold, 1] }
    );
    observer.observe(sheet);

    let removeScrollFallback: (() => void) | undefined;
    if (!CSS.supports('animation-timeline: scroll()')) {
      const updateBackdrop = () => {
        const width = sheet.offsetWidth || 1;
        const ratio = Math.max(0, Math.min(1, 1 - scroller.scrollLeft / width));
        dialog.style.setProperty('--drawer-backdrop', ratio.toFixed(3));
      };
      scroller.addEventListener('scroll', updateBackdrop, { passive: true });
      removeScrollFallback = () => scroller.removeEventListener('scroll', updateBackdrop);
    }

    const handleCancel = (e: Event) => {
      if (e.cancelable) {
        e.preventDefault();
        closeDrawer();
      } else {
        onDrawerClosed();
      }
    };
    dialog.addEventListener('cancel', handleCancel);

    const desktopMedia = window.matchMedia('(min-width: 1081px)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      if (e.matches && dialog.open) onDrawerClosed();
    };
    desktopMedia.addEventListener('change', handleMediaChange);

    return () => {
      observer.disconnect();
      removeScrollFallback?.();
      dialog.removeEventListener('cancel', handleCancel);
      desktopMedia.removeEventListener('change', handleMediaChange);
    };
  }, [closeDrawer]);

  // Ensure drawer closes after route changes
  useEffect(() => {
    const dialog = drawerRef.current;
    if (dialog?.open) {
      dialog.close();
      hasBeenVisibleRef.current = false;
      isClosingRef.current = false;
      setDrawerOpen(false);
    }
  }, [pathname]);

  const handleQuickSearch = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = quickQuery.trim();
    if (!trimmed) return;
    setQuickQuery('');
    closeDrawer();
    if (pathname === '/') {
      window.dispatchEvent(
        new CustomEvent('speedpart:quick-search', { detail: { mpn: trimmed, qty: 1 } })
      );
      return;
    }
    router.push(`/?mpn=${encodeURIComponent(trimmed)}&qty=1`);
  };

  return (
    <>
      <header className="hdr">
        <button
          type="button"
          className="icon-btn hdr-menu-btn"
          aria-label="開啟導覽選單"
          aria-expanded={drawerOpen}
          aria-controls={drawerId}
          onClick={openDrawer}
        >
          <Icon name="menu" size={18} aria-hidden="true" />
        </button>

        <Link href="/" className="hdr-brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          <BrandLogo size="md" />
        </Link>

        <nav className="hdr-nav" aria-label="主導覽">
          {navItems.map((item) => {
            const active = isNavActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={'hdr-nav-link' + (active ? ' active' : '')}
                aria-current={active ? 'page' : undefined}
              >
                <Icon name={item.icon} size={14} aria-hidden="true" />
                <span className="lbl">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="hdr-right">
          <search className="hdr-search-desktop">
            <form className="hdr-search-wrap" onSubmit={handleQuickSearch}>
              <label htmlFor={quickSearchId} className="visually-hidden">快速查詢料號</label>
              <button type="submit" className="hdr-search-btn" aria-label="快速查詢料號">
                <Icon name="search" size={14} aria-hidden="true" />
              </button>
              <input
                id={quickSearchId}
                name="mpn"
                type="search"
                className="hdr-search mono"
                placeholder="快速查詢料號…"
                value={quickQuery}
                onChange={(e) => setQuickQuery(e.target.value)}
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="search"
              />
            </form>
          </search>

          {/* Avatar with dropdown menu */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="avatar"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="使用者帳號選單"
              title={session?.user?.email ?? ''}
            >
              {initials}
            </button>
            {menuOpen && (
              <div className="hdr-user-menu" role="menu">
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--hairline)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{session?.user?.name || '使用者'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{session?.user?.email}</div>
                </div>
                <Link
                  href="/account/change-password"
                  onClick={() => setMenuOpen(false)}
                  className="hdr-user-menu-item"
                  role="menuitem"
                >
                  變更密碼
                </Link>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="hdr-user-menu-item danger"
                  role="menuitem"
                >
                  登出
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <dialog
        ref={drawerRef}
        id={drawerId}
        className="nav-drawer"
        aria-label="行動版導覽選單"
        onClick={(e) => {
          if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
            closeDrawer();
          }
        }}
      >
        <div ref={scrollerRef} className="nav-drawer-scroller">
          <nav ref={sheetRef} className="nav-drawer-sheet" aria-label="行動版主導覽">
            <div className="nav-drawer-head">
              <Link href="/" onClick={closeDrawer} style={{ textDecoration: 'none', color: 'inherit' }}>
                <BrandLogo size="sm" />
              </Link>
              <button
                type="button"
                className="icon-btn nav-drawer-close"
                aria-label="關閉導覽選單"
                autoFocus
                onClick={closeDrawer}
              >
                <Icon name="x" size={18} aria-hidden="true" />
              </button>
            </div>

            <search className="nav-drawer-search">
              <form className="hdr-search-wrap" onSubmit={handleQuickSearch}>
                <label htmlFor={drawerQuickSearchId} className="visually-hidden">快速查詢料號</label>
                <button type="submit" className="hdr-search-btn" aria-label="查詢料號">
                  <Icon name="search" size={14} aria-hidden="true" />
                </button>
                <input
                  id={drawerQuickSearchId}
                  name="mpn"
                  type="search"
                  className="hdr-search mono"
                  placeholder="輸入料號快速查詢…"
                  value={quickQuery}
                  onChange={(e) => setQuickQuery(e.target.value)}
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="search"
                />
              </form>
            </search>

            <ul className="nav-drawer-list">
              {navItems.map((item) => {
                const active = isNavActive(item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={'nav-drawer-link' + (active ? ' active' : '')}
                      aria-current={active ? 'page' : undefined}
                      onClick={closeDrawer}
                    >
                      <Icon name={item.icon} size={16} aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="nav-drawer-foot">
              <div className="nav-drawer-user">
                <div className="name">{session?.user?.name || '使用者'}</div>
                <div className="email mono">{session?.user?.email}</div>
              </div>
              <Link href="/account/change-password" className="nav-drawer-link" onClick={closeDrawer}>
                <Icon name="lock" size={15} aria-hidden="true" />
                <span>變更密碼</span>
              </Link>
              <button
                type="button"
                className="nav-drawer-link danger"
                onClick={() => signOut({ callbackUrl: '/login' })}
              >
                <span>登出系統</span>
              </button>
            </div>
          </nav>
        </div>
      </dialog>
    </>
  );
}
