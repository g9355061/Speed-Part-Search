import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { getUserByEmail, recordLoginLog, User } from './db';
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
        };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as User & { id: string }).role;
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string; id?: string }).role = token.role as string;
        (session.user as { role?: string; id?: string }).id = token.id as string;
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
