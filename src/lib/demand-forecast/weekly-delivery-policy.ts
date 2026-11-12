import type { PublicUser } from '@/lib/db';

/** 測試信與「週報暫停寄送」通知的收件人（Danny） */
export const WEEKLY_OWNER_EMAIL = 'g9355061@gmail.com';

export function weeklyDeliveryRecipients(users: Pick<PublicUser, 'email' | 'role' | 'status'>[], test: boolean, enabled: boolean): string[] {
  if (test) return [WEEKLY_OWNER_EMAIL];
  if (!enabled) return [];
  return [...new Set(users.filter(u => u.role === 'admin' && u.status === 'active').map(u => u.email.trim().toLowerCase()).filter(Boolean))];
}
