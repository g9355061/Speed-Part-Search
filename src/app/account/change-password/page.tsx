'use client';

import { useState, FormEvent } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ChangePasswordPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  if (status === 'loading') return null;
  if (status === 'unauthenticated') { router.push('/login'); return null; }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (next !== confirm) { setError('兩次輸入的新密碼不一致'); return; }
    if (next.length < 8) { setError('新密碼至少需要 8 個字元'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/account/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '更新失敗');
      } else {
        setSuccess(true);
        setTimeout(() => router.push('/'), 1500);
      }
    } catch {
      setError('伺服器錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Mini header */}
      <header style={{ height: 56, background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 26, height: 26, borderRadius: 5, background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>S</div>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Speed Part Search</span>
        </div>
        <Link href="/" style={{ marginLeft: 12, padding: '6px 10px', borderRadius: 'var(--r-sm)', color: 'var(--text-2)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>← 返回主頁</Link>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>{session?.user?.email}</span>
      </header>

      <main style={{ maxWidth: 480, margin: '48px auto', padding: '0 24px' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700 }}>變更密碼</h1>
        <p style={{ margin: '0 0 28px', fontSize: 13, color: 'var(--text-3)' }}>請輸入目前密碼與新密碼</p>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '28px 24px', boxShadow: 'var(--shadow-1)' }}>
          {success ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)', marginBottom: 6 }}>密碼已成功更新</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>即將返回主頁…</div>
            </div>
          ) : (
            <>
          {error && (
            <div style={{ background: '#FFF0F0', border: '1px solid #FECACA', borderRadius: 'var(--r-sm)', padding: '10px 14px', marginBottom: 18, fontSize: 13, color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="目前密碼" value={current} onChange={setCurrent} />
            <hr style={{ border: 'none', borderTop: '1px solid var(--hairline)', margin: '4px 0' }} />
            <Field label="新密碼" value={next} onChange={setNext} hint="至少 8 個字元" />
            <Field label="確認新密碼" value={confirm} onChange={setConfirm} />

            <button
              type="submit"
              disabled={loading}
              style={{ height: 38, background: loading ? 'var(--border-strong)' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4 }}
            >
              {loading ? '更新中…' : '確認變更'}
            </button>
          </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Field({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
        {label}{hint && <span style={{ fontWeight: 400, color: 'var(--text-4)', marginLeft: 6 }}>{hint}</span>}
      </span>
      <input
        type="password"
        value={value}
        onChange={e => onChange(e.target.value)}
        required
        placeholder="••••••••"
        style={{ height: 36, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, color: 'var(--text)', background: 'var(--surface)', outline: 'none' }}
      />
    </label>
  );
}
