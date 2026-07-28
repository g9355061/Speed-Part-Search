import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createPendingUser, getUserByEmail } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { name, email, password, department } = await req.json();

    if (!name?.trim() || !email?.trim() || !password || !department?.trim()) {
      return NextResponse.json({ error: '請填寫所有欄位（含 Division / 部門）' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: '密碼至少需要 8 個字元' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await getUserByEmail(normalizedEmail);
    if (existing) {
      return NextResponse.json({ error: '此 Email 已被使用' }, { status: 409 });
    }

    const hash = await bcrypt.hash(password, 12);
    await createPendingUser(name.trim(), normalizedEmail, hash, department.trim());

    return NextResponse.json({ message: '申請成功，請等待管理員審核' });
  } catch (e) {
    console.error('[register]', e);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
