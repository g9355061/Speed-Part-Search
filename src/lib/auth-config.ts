import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { getUserByEmail, getUserById, recordLoginLog, User } from './db';
import geoip from 'geoip-lite';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await getUserByEmail(credentials.email.trim().toLowerCase());

        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password, user.password_hash);
        if (!valid) return null;

        if (user.status === 'pending') throw new Error('PENDING');
        if (user.status === 'rejected') throw new Error('REJECTED');

        // Record login location
        const forwarded = req?.headers?.['x-forwarded-for'];
        const rawIp = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0].trim()
          || req?.headers?.['x-real-ip'] as string
          || '';
        const ip = rawIp === '::1' || rawIp === '127.0.0.1' ? '' : rawIp;
        const geo = ip ? geoip.lookup(ip) : null;
        recordLoginLog(user.id, ip || 'localhost', geo?.city ?? null, geo?.country ?? null).catch(console.error);

        return {
          id: String(user.id),
          email: user.email,
          name: user.name,
          role: user.role,
          sessionVersion: user.session_version ?? 1,
        };
      },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as User & { id: string; sessionVersion?: number };
        token.role = u.role;
        token.id = u.id;
        token.sessionVersion = u.sessionVersion ?? 1;
        token.sessionCheckedAt = Math.floor(Date.now() / 1000);
        const ttlSec = u.role === 'admin' ? 30 * 24 * 60 * 60 : 48 * 60 * 60;
        token.sessionExpiresAt = Math.floor(Date.now() / 1000) + ttlSec;
        return token;
      }

      // Session 撤銷：JWT 內的角色/權限在登入時就定案，帳號停用、刪除或改密碼
      //（session_version 提升）原本擋不住既有 session。這裡每 5 分鐘對 DB 校驗一次，
      // 失效時把 sessionExpiresAt 設為過去，交給 middleware 既有的過期檢查踢下線。
      const nowSec = Math.floor(Date.now() / 1000);
      const checkedAt = (token.sessionCheckedAt as number | undefined) ?? 0;
      if (nowSec - checkedAt > 300 && token.id) {
        try {
          const dbUser = await getUserById(token.id as string);
          const tokenVersion = (token.sessionVersion as number | undefined) ?? 1;
          if (!dbUser || dbUser.status !== 'active' || (dbUser.session_version ?? 1) !== tokenVersion) {
            token.sessionExpiresAt = 1; // 過去的時間戳（不用 0：middleware 以 truthy 判斷 exp）
          } else {
            token.role = dbUser.role; // 順帶同步角色變更（升/降權免重新登入）
            token.sessionCheckedAt = nowSec;
          }
        } catch (err) {
          // DB 暫時不可用：不強制登出，維持原 token，下個週期再驗
          console.warn('[AUTH] session version check failed:', err);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string; id?: string }).role = token.role as string;
        (session.user as { role?: string; id?: string }).id = token.id as string;
      }
      const exp = token.sessionExpiresAt as number | undefined;
      if (exp) {
        session.expires = new Date(exp * 1000).toISOString();
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
