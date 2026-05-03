import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { deleteUser, getUserById, listUsers, setUserStatus, updateUserPassword } from '@/lib/db';
import { sendApprovalEmail, sendRejectionEmail } from '@/lib/email';

function adminOnly(session: ReturnType<typeof getServerSession> extends Promise<infer T> ? T : never) {
  return !session || (session as { user?: { role?: string } }).user?.role !== 'admin';
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (adminOnly(session)) return NextResponse.json({ error: '無權限' }, { status: 403 });

  const users = await listUsers();

  return NextResponse.json({ users });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (adminOnly(session)) return NextResponse.json({ error: '無權限' }, { status: 403 });

  try {
    const { id, action } = await req.json();
    if (!id || !['approve', 'reject', 'deactivate', 'reset-password', 'delete'].includes(action)) {
      return NextResponse.json({ error: '無效請求' }, { status: 400 });
    }

    const user = await getUserById(id);
    if (!user) return NextResponse.json({ error: '找不到使用者' }, { status: 404 });

    if (action === 'approve') {
      await setUserStatus(id, 'active');
      await sendApprovalEmail(user.email, user.name).catch(console.error);
      return NextResponse.json({ message: '已核准' });
    }

    if (action === 'reject') {
      await setUserStatus(id, 'rejected');
      await sendRejectionEmail(user.email, user.name).catch(console.error);
      return NextResponse.json({ message: '已拒絕' });
    }

    if (action === 'deactivate') {
      await setUserStatus(id, 'pending');
      return NextResponse.json({ message: '已停用' });
    }

    if (action === 'reset-password') {
      const crypto = await import('crypto');
      const tempPassword = crypto.randomBytes(6).toString('hex');
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.hash(tempPassword, 12);
      await updateUserPassword(id, hash);
      return NextResponse.json({ message: '密碼已重設', tempPassword });
    }

    if (action === 'delete') {
      if (user.role === 'admin') {
        return NextResponse.json({ error: '無法刪除管理員帳號' }, { status: 400 });
      }
      await deleteUser(id);
      return NextResponse.json({ message: '已刪除帳號' });
    }

  } catch (e) {
    console.error('[admin/users]', e);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
