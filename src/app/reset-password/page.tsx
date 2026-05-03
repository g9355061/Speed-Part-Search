'use client';

import { useState, FormEvent, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('兩次輸入的密碼不一致');
      return;
    }
    if (password.length < 8) {
      setError('密碼至少需要 8 個字元');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '重設失敗');
      } else {
        setSuccess(true);
        setTimeout(() => router.push('/login'), 2000);
      }
    } catch {
      setError('伺服器錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: 'var(--danger)', fontSize: 13 }}>連結無效，請重新申請忘記密碼。</p>
        <Link href="/forgot-password" style={{ fontSize: 13, color: 'var(--primary-2)', textDecoration: 'none' }}>重新申請</Link>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32, justifyContent: 'center' }}>
          <div style={{ width: 32, height: 32, borderRadius: 7, background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700 }}>S</div>
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em' }}>Speed Part Search</span>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '32px 28px', boxShadow: 'var(--shadow-2)' }}>
          {success ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
              <h2 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700 }}>密碼重設成功</h2>
              <p style={{ fontSize: 13, color: 'var(--text-2)' }}>即將跳轉至登入頁…</p>
            </div>
          ) : (
            <>
              <h1 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>重設密碼</h1>
              <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text-3)' }}>請輸入您的新密碼</p>

              {error && (
                <div style={{ background: '#FFF0F0', border: '1px solid #FECACA', borderRadius: 'var(--r-sm)', padding: '10px 12px', marginBottom: 16, fontSize: 13, color: 'var(--danger)' }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>新密碼</span>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    placeholder="至少 8 個字元"
                    style={inputStyle}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>確認新密碼</span>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    placeholder="再次輸入新密碼"
                    style={inputStyle}
                  />
                </label>
                <button
                  type="submit"
                  disabled={loading}
                  style={{ height: 38, background: loading ? 'var(--border-strong)' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}
                >
                  {loading ? '重設中…' : '確認重設'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  height: 36,
  padding: '0 10px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  fontSize: 13,
  color: 'var(--text)',
  background: 'var(--surface)',
  outline: 'none',
};

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
