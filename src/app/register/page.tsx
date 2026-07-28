'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';

const DEPARTMENTS = [
  'Unspecified',
  'PM',
  'IE',
  'ME',
  'PD',
  'SCM',
  'QA',
  'TE',
];

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirm) { setError('兩次輸入的密碼不一致'); return; }
    if (password.length < 8) { setError('密碼至少需要 8 個字元'); return; }
    if (!department) { setError('請選擇 Division / 部門'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, department }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || '申請失敗');
      else setSuccess(true);
    } catch {
      setError('伺服器錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '24px' }}>
        <div style={{ width: '100%', maxWidth: '380px', textAlign: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 24 }}>✓</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>申請已送出</h2>
          <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
            您的帳號申請已收到，管理員審核通過後即可登入。<br />審核結果將以 Email 通知。
          </p>
          <Link href="/login" style={{ display: 'inline-block', padding: '8px 24px', background: 'var(--primary)', color: '#fff', borderRadius: 'var(--r-sm)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
            返回登入
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32, justifyContent: 'center' }}>
          <div style={{ width: 32, height: 32, borderRadius: 7, background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700 }}>S</div>
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em' }}>Speed Part Search</span>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '32px 28px', boxShadow: 'var(--shadow-2)' }}>
          <h1 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700 }}>申請帳號</h1>
          <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text-3)' }}>填寫資料後送出，等待管理員審核</p>

          {error && (
            <div style={{ background: '#FFF0F0', border: '1px solid #FECACA', borderRadius: 'var(--r-sm)', padding: '10px 12px', marginBottom: 16, fontSize: 13, color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={labelStyle}>姓名</span>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="王小明" style={inputStyle} />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={labelStyle}>Email</span>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" style={inputStyle} />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={labelStyle}>Division / 部門</span>
              <select
                value={department}
                onChange={e => setDepartment(e.target.value)}
                required
                style={{ ...inputStyle, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}
              >
                {DEPARTMENTS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={labelStyle}>密碼</span>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="至少 8 個字元" style={inputStyle} />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={labelStyle}>確認密碼</span>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder="再次輸入密碼" style={inputStyle} />
            </label>

            <button
              type="submit"
              disabled={loading}
              style={{ height: 38, background: loading ? 'var(--border-strong)' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4 }}
            >
              {loading ? '送出中…' : '送出申請'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-3)' }}>
          已有帳號？{' '}
          <Link href="/login" style={{ color: 'var(--primary-2)', textDecoration: 'none', fontWeight: 500 }}>返回登入</Link>
        </p>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-2)' };
const inputStyle: React.CSSProperties = {
  height: 36, padding: '0 10px',
  border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
  fontSize: 13, color: 'var(--text)', background: 'var(--surface)', outline: 'none',
};
