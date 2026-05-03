'use client';

import { useState, FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';

const ERROR_MESSAGES: Record<string, string> = {
  PENDING: '帳號尚未審核，請等待管理員核准',
  REJECTED: '帳號申請已被拒絕，請聯絡管理員',
  CredentialsSignin: 'Email 或密碼錯誤',
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const urlError = params.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(urlError ? (ERROR_MESSAGES[urlError] ?? '登入失敗') : '');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await signIn('credentials', {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      setError(ERROR_MESSAGES[res.error] ?? '登入失敗，請確認帳號密碼');
    } else {
      router.push('/');
      router.refresh();
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32, justifyContent: 'center' }}>
          <div style={{ width: 32, height: 32, borderRadius: 7, background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700 }}>S</div>
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em' }}>Speed Part Search</span>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '32px 28px', boxShadow: 'var(--shadow-2)' }}>
          <h1 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>登入</h1>
          <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text-3)' }}>請輸入您的帳號資訊</p>

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

            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>密碼</span>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{ height: 36, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, color: 'var(--text)', background: 'var(--surface)', outline: 'none' }}
              />
            </label>

            <div style={{ textAlign: 'right', marginTop: -6 }}>
              <Link href="/forgot-password" style={{ fontSize: 12, color: 'var(--primary-2)', textDecoration: 'none' }}>
                忘記密碼？
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ height: 38, background: loading ? 'var(--border-strong)' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4 }}
            >
              {loading ? '登入中…' : '登入'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-3)' }}>
          還沒有帳號？{' '}
          <Link href="/register" style={{ color: 'var(--primary-2)', textDecoration: 'none', fontWeight: 500 }}>
            申請帳號
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
