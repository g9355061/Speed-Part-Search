'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: 'user' | 'admin';
  department: string;
  status: 'pending' | 'active' | 'rejected';
  created_at: string;
  last_login_time: string | null;
  last_login_city: string | null;
  last_login_country: string | null;
  last_login_ip: string | null;
}

const STATUS_LABEL: Record<string, string> = { pending: '待審核', active: '已核准', rejected: '已拒絕' };
const STATUS_COLOR: Record<string, string> = { pending: '#B7791F', active: '#0B6E3F', rejected: '#B33A3A' };
const STATUS_BG: Record<string, string> = { pending: '#FBF1DE', active: '#E5F4EC', rejected: '#FFF0F0' };

type ActionMsg = { id: number; msg: string; isTemp?: boolean; isError?: boolean };

export default function AdminUsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<ActionMsg | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session || session.user.role !== 'admin') { router.push('/'); return; }
    fetchUsers();
  }, [session, status, router]);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      setUsers(data.users ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(id: number, action: string) {
    setActionMsg(null);
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    });
    const data = await res.json();
    if (action === 'delete') {
      if (res.ok) {
        setUsers(u => u.filter(x => x.id !== id));
        setConfirmDelete(null);
        return;
      }
    }
    setActionMsg({
      id,
      msg: data.tempPassword ? `臨時密碼：${data.tempPassword}（請妥善傳達給使用者）` : (data.message || data.error),
      isTemp: !!data.tempPassword,
      isError: !res.ok,
    });
    if (res.ok && action !== 'reset-password') await fetchUsers();
  }

  const pendingCount = users.filter(u => u.status === 'pending').length;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{ height: 56, background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 24, position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 26, height: 26, borderRadius: 5, background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>S</div>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Speed Part Search</span>
        </div>
        <Link href="/" style={{ padding: '6px 10px', borderRadius: 'var(--r-sm)', color: 'var(--text-2)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>← 返回主頁</Link>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>{session?.user?.email}</span>
      </header>

      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700 }}>使用者管理</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>
            {pendingCount > 0 ? `目前有 ${pendingCount} 筆待審核申請` : '目前無待審核申請'}
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)', fontSize: 13 }}>載入中…</div>
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-1)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  {['姓名', '部門', 'Email', '角色', '狀態', '申請時間', '最近登入', '登入地點', '操作'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.03em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>尚無使用者</td></tr>
                )}
                {users.map(user => (
                  <>
                    <tr key={user.id} style={{ borderBottom: '1px solid var(--hairline)' }}>
                      <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 500 }}>{user.name}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-2)' }}>
                        {user.department || <span style={{ color: 'var(--text-4)' }}>—</span>}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{user.email}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 999, background: user.role === 'admin' ? 'var(--primary-soft)' : 'var(--surface-2)', color: user.role === 'admin' ? 'var(--primary)' : 'var(--text-2)', fontWeight: 500, fontSize: 11 }}>
                          {user.role === 'admin' ? '管理員' : '一般用戶'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ padding: '3px 8px', borderRadius: 999, background: STATUS_BG[user.status], color: STATUS_COLOR[user.status], fontSize: 11.5, fontWeight: 600 }}>
                          {STATUS_LABEL[user.status]}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                        {new Date(user.created_at).toLocaleDateString('zh-TW')}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                        {user.last_login_time
                          ? new Date(user.last_login_time).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                          : <span style={{ color: 'var(--text-4)' }}>—</span>}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                        {user.last_login_city || user.last_login_country
                          ? <span title={user.last_login_ip ?? ''}>{[user.last_login_city, user.last_login_country].filter(Boolean).join(', ')}</span>
                          : user.last_login_time
                            ? <span style={{ color: 'var(--text-4)' }}>本機</span>
                            : <span style={{ color: 'var(--text-4)' }}>—</span>}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {user.status === 'pending' && (
                            <>
                              <Btn label="核准" color="var(--accent)" onClick={() => handleAction(user.id, 'approve')} />
                              <Btn label="拒絕" color="var(--danger)" onClick={() => handleAction(user.id, 'reject')} />
                            </>
                          )}
                          {user.status === 'active' && user.role !== 'admin' && (
                            <Btn label="停用" color="var(--warn)" onClick={() => handleAction(user.id, 'deactivate')} />
                          )}
                          {user.status === 'rejected' && (
                            <Btn label="重新核准" color="var(--accent)" onClick={() => handleAction(user.id, 'approve')} />
                          )}
                          {user.role !== 'admin' && (
                            <>
                              <Btn
                                label="刪除"
                                color="var(--danger)"
                                onClick={() => setConfirmDelete(user.id)}
                                style={{ borderStyle: 'dashed' }}
                              />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Inline feedback row */}
                    {actionMsg?.id === user.id && (
                      <tr key={`msg-${user.id}`}>
                        <td colSpan={9} style={{ padding: '8px 14px', background: actionMsg.isTemp ? 'var(--warn-soft)' : actionMsg.isError ? '#FFF0F0' : 'var(--surface-2)' }}>
                          <span style={{ fontSize: 12, color: actionMsg.isTemp ? 'var(--warn)' : actionMsg.isError ? 'var(--danger)' : 'var(--text-2)', fontFamily: actionMsg.isTemp ? 'var(--font-mono)' : undefined }}>
                            {actionMsg.msg}
                          </span>
                        </td>
                      </tr>
                    )}

                    {/* Inline delete confirm row */}
                    {confirmDelete === user.id && (
                      <tr key={`del-${user.id}`}>
                        <td colSpan={9} style={{ padding: '10px 14px', background: '#FFF0F0', borderBottom: '1px solid #FECACA' }}>
                          <span style={{ fontSize: 13, color: 'var(--danger)', marginRight: 16 }}>
                            確定要永久刪除 <strong>{user.name}</strong> 的帳號？此操作無法復原。
                          </span>
                          <button onClick={() => handleAction(user.id, 'delete')} style={{ padding: '4px 14px', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginRight: 8 }}>確認刪除</button>
                          <button onClick={() => setConfirmDelete(null)} style={{ padding: '4px 12px', background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 12, cursor: 'pointer' }}>取消</button>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function Btn({ label, color, onClick, style }: { label: string; color: string; onClick: () => void; style?: React.CSSProperties }) {
  return (
    <button onClick={onClick} style={{ padding: '4px 10px', border: `1px solid ${color}`, borderRadius: 'var(--r-sm)', background: 'transparent', color, fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', ...style }}>
      {label}
    </button>
  );
}
