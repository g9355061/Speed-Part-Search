'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '發生錯誤');
      } else {
        setSubmitted(true);
      }
    } catch {
      setError('伺服器錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32, justifyContent: 'center' }}>
          <div style={{ width: 32, height: 32, borderRadius: 7, background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700 }}>S</div>
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em' }}>Speed Part Search</span>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '32px 28px', boxShadow: 'var(--shadow-2)' }}>
          {submitted ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📧</div>
              <h2 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700 }}>重設連結已發送</h2>
              <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
                若此 Email 已申請帳號，重設連結已發送至信箱。<br />
                連結 1 小時內有效。<br /><br />
                若未設定 Email，請聯絡管理員協助重設密碼。
              </p>
              <Link href="/login" style={{ fontSize: 13, color: 'var(--primary-2)', textDecoration: 'none', fontWeight: 500 }}>
                返回登入
              </Link>
            </div>
          ) : (
            <>
              <h1 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>忘記密碼</h1>
              <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text-3)' }}>輸入您的 Email，我們將發送重設連結</p>

              {error && (
                <div style={{ background: '#FFF0F0', border: '1px solid #FECACA', borderRadius: 'var(--r-sm)', padding: '10px 12px', marginBottom: 16, fontSize: 13, color: 'var(--danger)' }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    style={{ height: 36, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, color: 'var(--text)', background: 'var(--surface)', outline: 'none' }}
                  />
                </label>
                <button
                  type="submit"
                  disabled={loading}
                  style={{ height: 38, background: loading ? 'var(--border-strong)' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}
                >
                  {loading ? '發送中…' : '發送重設連結'}
                </button>
              </form>
            </>
          )}
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-3)' }}>
          <Link href="/login" style={{ color: 'var(--primary-2)', textDecoration: 'none', fontWeight: 500 }}>
            ← 返回登入
          </Link>
        </p>
      </div>
    </div>
  );
}
