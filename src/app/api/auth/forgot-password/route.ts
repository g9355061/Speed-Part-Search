import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createPasswordResetToken, getActiveUserByEmail, invalidatePasswordResetTokens } from '@/lib/db';
import { sendPasswordResetEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email?.trim()) {
      return NextResponse.json({ error: '請輸入 Email' }, { status: 400 });
    }

    // Always return success to prevent email enumeration
    const user = await getActiveUserByEmail(email.trim().toLowerCase());

    if (user) {
      // Invalidate old tokens for this user
      await invalidatePasswordResetTokens(user.id);

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      await createPasswordResetToken(user.id, token, expiresAt);

      await sendPasswordResetEmail(user.email, token);
    }

    return NextResponse.json({ message: '若此 Email 存在，重設連結已發送' });
  } catch (e) {
    console.error('[forgot-password]', e);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
