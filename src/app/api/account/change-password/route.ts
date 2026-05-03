import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import bcrypt from 'bcryptjs';
import { authOptions } from '@/lib/auth-config';
import { getUserById, updateUserPassword } from '@/lib/db';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: '請先登入' }, { status: 401 });

  try {
    const { currentPassword, newPassword } = await req.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: '請填寫所有欄位' }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: '新密碼至少需要 8 個字元' }, { status: 400 });
    }

    const user = await getUserById(session.user.id);
    if (!user) return NextResponse.json({ error: '找不到帳號' }, { status: 404 });

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return NextResponse.json({ error: '目前密碼不正確' }, { status: 400 });

    const hash = await bcrypt.hash(newPassword, 12);
    await updateUserPassword(user.id, hash);

    return NextResponse.json({ message: '密碼已更新' });
  } catch (e) {
    console.error('[change-password]', e);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
