import type { PublicUser } from '@/lib/db';

export function weeklyDeliveryRecipients(users: Pick<PublicUser, 'email' | 'role' | 'status'>[], test: boolean, enabled: boolean): string[] {
  if (test) return ['g9355061@gmail.com'];
  if (!enabled) return [];
  return [...new Set(users.filter(u => u.role === 'admin' && u.status === 'active').map(u => u.email.trim().toLowerCase()).filter(Boolean))];
}
