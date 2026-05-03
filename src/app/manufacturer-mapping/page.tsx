'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { MANUFACTURER_ALIASES, normalizeManufacturer } from '@/lib/manufacturers';
import manufacturerDisplayNames from '@/data/manufacturer-display-names.json';

type AliasMap = Record<string, string>;
const DISPLAY_NAMES: Record<string, string> = manufacturerDisplayNames;

interface MappingRow {
  canonical: string;
  aliases: string[];
}

function titleCaseName(value: string): string {
  const displayName = DISPLAY_NAMES[normalizeManufacturer(value)] ?? DISPLAY_NAMES[value];
  if (displayName) return displayName;
  const upper = new Set(['ti', 'st', 'nxp', 'jst', 'koa']);
  return value
    .split(' ')
    .map((part) => upper.has(part) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function rowsFromAliases(aliases: AliasMap): MappingRow[] {
  const grouped = new Map<string, string[]>();
  for (const [alias, canonical] of Object.entries(aliases)) {
    grouped.set(canonical, [...(grouped.get(canonical) ?? []), alias]);
  }
  return [...grouped.entries()]
    .map(([canonical, names]) => ({
      canonical,
      aliases: [...new Set([canonical, ...names])].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.canonical.localeCompare(b.canonical));
}

export default function ManufacturerMappingPage() {
  const searchParams = useSearchParams();
  const bomParam = searchParams.get('bom');
  const apiParam = searchParams.get('api');

  const [aliases, setAliases] = useState<AliasMap>(MANUFACTURER_ALIASES);
  const [editingCanonical, setEditingCanonical] = useState<string | null>(null);
  const [aliasInputs, setAliasInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingAlias, setPendingAlias] = useState<{ canonical: string; alias: string } | null>(null);
  const [pendingNewGroup, setPendingNewGroup] = useState<{ canonical: string; alias: string } | null>(null);
  const autoOpenedRef = useRef(false);

  const rows = useMemo(() => rowsFromAliases(aliases), [aliases]);
  const aliasCount = rows.reduce((sum, row) => sum + row.aliases.length, 0);

  useEffect(() => {
    let active = true;
    fetch('/api/manufacturer-mapping', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { aliases?: AliasMap } | null) => {
        if (active && data?.aliases) setAliases(data.aliases);
      })
      .catch(() => {
        if (active) setMessage('讀取最新對照表失敗，先顯示目前內建資料。');
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (autoOpenedRef.current || !bomParam || !apiParam) return;
    const apiCanonical = aliases[normalizeManufacturer(apiParam)];
    const bomCanonical = aliases[normalizeManufacturer(bomParam)];
    if (apiCanonical) {
      if (bomCanonical === apiCanonical) return;
      autoOpenedRef.current = true;
      setEditingCanonical(apiCanonical);
      setPendingAlias({ canonical: apiCanonical, alias: bomParam });
      setTimeout(() => {
        document.getElementById(`mfr-row-${apiCanonical}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } else {
      autoOpenedRef.current = true;
      setPendingNewGroup({ canonical: normalizeManufacturer(apiParam), alias: bomParam });
    }
  }, [aliases, bomParam, apiParam]);

  async function saveAliases(nextAliases: AliasMap, successMessage: string) {
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/manufacturer-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aliases: nextAliases }),
      });
      if (!response.ok) throw new Error('Save failed');
      const data = await response.json() as { aliases: AliasMap };
      setAliases(data.aliases);
      setMessage(successMessage);
    } catch {
      setMessage('儲存失敗，請稍後再試。');
    } finally {
      setSaving(false);
    }
  }

  async function addAlias(event: FormEvent<HTMLFormElement>, canonical: string) {
    event.preventDefault();
    const alias = normalizeManufacturer(aliasInputs[canonical]);
    if (!canonical || !alias) {
      setMessage('請輸入要新增的名稱。');
      return;
    }
    await saveAliases({ ...aliases, [canonical]: canonical, [alias]: canonical }, '已新增對照名稱。');
    setAliasInputs((current) => ({ ...current, [canonical]: '' }));
  }

  async function deleteAlias(alias: string) {
    const nextAliases = { ...aliases };
    delete nextAliases[alias];
    await saveAliases(nextAliases, '已刪除名稱。');
  }

  async function deleteGroup(canonical: string) {
    const nextAliases = Object.fromEntries(
      Object.entries(aliases).filter(([alias, target]) => alias !== canonical && target !== canonical),
    );
    await saveAliases(nextAliases, '已刪除整組對照。');
    setEditingCanonical(null);
  }

  async function confirmPendingAlias() {
    if (!pendingAlias) return;
    const alias = normalizeManufacturer(pendingAlias.alias);
    const canonical = pendingAlias.canonical;
    if (!alias) return;
    await saveAliases(
      { ...aliases, [canonical]: canonical, [alias]: canonical },
      `已將「${pendingAlias.alias}」新增為同一家公司。`,
    );
    localStorage.setItem('mfr_aliases_updated', Date.now().toString());
    setPendingAlias(null);
    setEditingCanonical(null);
  }

  async function confirmPendingNewGroup() {
    if (!pendingNewGroup) return;
    const canonical = pendingNewGroup.canonical;
    const alias = normalizeManufacturer(pendingNewGroup.alias);
    if (!canonical || !alias) return;
    await saveAliases(
      { ...aliases, [canonical]: canonical, [alias]: canonical },
      `已建立新群組「${pendingNewGroup.canonical}」並加入「${pendingNewGroup.alias}」。`,
    );
    localStorage.setItem('mfr_aliases_updated', Date.now().toString());
    setPendingNewGroup(null);
  }

  return (
    <div className="app">
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
          <Link href="/" className="hdr-nav-link"><Icon name="search" size={14} /><span className="lbl">單料查詢</span></Link>
          <Link href="/batch" className="hdr-nav-link"><Icon name="compare" size={14} /><span className="lbl">BOM Batch</span></Link>
          <Link href="/batch-manufacturer" className="hdr-nav-link"><Icon name="compare" size={14} /><span className="lbl">BOM Batch - MFR</span></Link>
          <Link href="/manufacturer-mapping" className="hdr-nav-link active"><Icon name="compare" size={14} /><span className="lbl">廠商對照表</span></Link>
        </nav>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px', width: '100%' }}>
        <div className="mapping-titlebar">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 6px', letterSpacing: '-0.02em' }}>廠商名字比較表</h1>
            <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>
              以 API 系統標準名為主，整理目前系統會視為同一家公司的一組名稱。這份清單會作為後續資料學習與人工校正的基礎。
            </p>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-hd">
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="compare" size={14} />
              Mapping 摘要
            </h3>
          </div>
          <div className="card-bd" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            <div className="map-stat">
              <span>標準廠商</span>
              <strong>{rows.length}</strong>
            </div>
            <div className="map-stat">
              <span>已知名稱</span>
              <strong>{aliasCount}</strong>
            </div>
            <div className="map-stat">
              <span>比對策略</span>
              <strong>Alias + Fuzzy</strong>
            </div>
          </div>
        </div>

        {pendingNewGroup && (
          <div className="card" style={{ marginBottom: 20, border: '1px solid #f59e0b' }}>
            <div className="card-hd" style={{ background: '#fff8ec' }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#92400e' }}>新增廠商群組</h3>
              <span style={{ fontSize: 12, color: '#92400e' }}>此 API 廠商尚未建立群組，確認後會新增</span>
            </div>
            <div className="card-bd flush">
              <table className="mapping-table">
                <thead>
                  <tr>
                    <th style={{ width: 220 }}>API 系統標準名（新建）</th>
                    <th>會視為同一家的名稱</th>
                    <th style={{ width: 140 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <div className="mapping-canonical">{apiParam}</div>
                      <div className="mapping-key mono">{pendingNewGroup.canonical}</div>
                    </td>
                    <td>
                      <div className="mapping-aliases">
                        <span className="mapping-chip-pending">
                          {pendingNewGroup.alias}
                          <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 2 }}>待確認</span>
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="mapping-confirm-btn"
                        onClick={confirmPendingNewGroup}
                        disabled={saving}
                      >
                        {saving ? '儲存中…' : '確認建立'}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {bomParam && apiParam && !pendingNewGroup && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fff3e0', border: '1px solid #f59e0b', borderRadius: 6, fontSize: 13, color: '#92400e' }}>
            來自 BOM 比對：<strong>{bomParam}</strong> vs <strong>{apiParam}</strong>
            {pendingAlias
              ? ` — 已在下方群組預先加入「${pendingAlias.alias}」，確認後按「確認新增」儲存。`
              : ' — 找不到對應廠商群組，請手動新增或編輯。'}
          </div>
        )}
        {message && <div className="mapping-message">{message}</div>}

        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-hd">
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>目前廠商名稱 Mapping</h3>
          </div>
          <div className="card-bd flush">
            <table className="mapping-table">
              <thead>
                <tr>
                  <th style={{ width: 220 }}>API 系統標準名</th>
                  <th>會視為同一家的名稱</th>
                  <th style={{ width: 110 }}>數量</th>
                  <th style={{ width: 140 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isEditing = editingCanonical === row.canonical;
                  return (
                    <tr key={row.canonical} id={`mfr-row-${row.canonical}`}>
                      <td>
                        <div className="mapping-canonical">{titleCaseName(row.canonical)}</div>
                        <div className="mapping-key mono">{row.canonical}</div>
                      </td>
                      <td>
                        <div className="mapping-aliases">
                          {row.aliases.map((alias) => (
                            <span key={alias}>
                              {titleCaseName(alias)}
                              {isEditing && alias !== row.canonical && (
                                <button type="button" className="mapping-chip-remove" onClick={() => deleteAlias(alias)} disabled={saving} aria-label={`刪除 ${alias}`}>
                                  ×
                                </button>
                              )}
                            </span>
                          ))}
                          {pendingAlias?.canonical === row.canonical && isEditing && (
                            <span className="mapping-chip-pending">
                              {titleCaseName(pendingAlias.alias)}
                              <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 2 }}>待確認</span>
                            </span>
                          )}
                        </div>
                        {isEditing && !pendingAlias && (
                          <form className="mapping-inline-form" onSubmit={(event) => addAlias(event, row.canonical)}>
                            <input
                              value={aliasInputs[row.canonical] ?? ''}
                              onChange={(event) => setAliasInputs((current) => ({ ...current, [row.canonical]: event.target.value }))}
                              placeholder="新增同家公司名稱"
                            />
                            <button type="submit" disabled={saving}>{saving ? '儲存中' : '新增'}</button>
                          </form>
                        )}
                      </td>
                      <td className="mono" style={{ textAlign: 'center', color: 'var(--text-3)' }}>{row.aliases.length}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="mapping-row-actions">
                          {pendingAlias?.canonical === row.canonical && isEditing ? (
                            <button
                              type="button"
                              className="mapping-confirm-btn"
                              onClick={confirmPendingAlias}
                              disabled={saving}
                            >
                              {saving ? '儲存中…' : '確認新增'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="mapping-edit-btn compact"
                              onClick={() => setEditingCanonical(isEditing ? null : row.canonical)}
                              disabled={saving}
                            >
                              {isEditing ? '完成' : '編輯'}
                            </button>
                          )}
                          {isEditing && !pendingAlias && (
                            <button type="button" className="mapping-delete-btn" onClick={() => deleteGroup(row.canonical)} disabled={saving}>
                              刪除整組
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-bd" style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text)' }}>目前規則：</strong>
            廠商名稱會先 normalize（大小寫、標點、Inc/Corp/Ltd/Co 等尾綴），再套用上方 alias 表；若仍無法命中，會用相似度判斷 `疑似同廠商` 或 `廠商不一致`。
          </div>
        </div>
      </main>
    </div>
  );
}
