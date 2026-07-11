import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { canAccessQqInquiry } from '@/lib/permissions';

export interface QqApiUser {
  name: string;
  email: string;
}

// QQ 詢價 API 共用權限閘：admin 或被授權的採購帳號才可存取
export async function requireQqInquiryUser(): Promise<QqApiUser | null> {
  const session = await getServerSession(authOptions);
  const user = session?.user as { name?: string | null; email?: string | null; role?: string | null } | undefined;
  if (!user || !canAccessQqInquiry(user)) return null;
  return { name: user.name ?? '', email: user.email ?? '' };
}
