import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getPasswordResetToken, markPasswordResetTokenUsed, updateUserPassword } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();

    if (!token || !password) {
      return NextResponse.json({ error: '缺少必要參數' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: '密碼至少需要 8 個字元' }, { status: 400 });
    }

    const record = await getPasswordResetToken(token);

    if (!record) {
      return NextResponse.json({ error: '連結無效或已使用' }, { status: 400 });
    }
    if (new Date(record.expires_at) < new Date()) {
      return NextResponse.json({ error: '連結已過期，請重新申請' }, { status: 400 });
    }

    const hash = await bcrypt.hash(password, 12);
    await updateUserPassword(record.user_id, hash);
    await markPasswordResetTokenUsed(record.id);

    return NextResponse.json({ message: '密碼重設成功' });
  } catch (e) {
    console.error('[reset-password]', e);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
