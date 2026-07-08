const QQ_INQUIRY_ALLOWED_EMAILS = [
  'xiaomin@yangshin.com',
];

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? '';
}

function configuredQqInquiryEmails() {
  const raw = process.env.NEXT_PUBLIC_QQ_INQUIRY_ALLOWED_EMAILS || process.env.QQ_INQUIRY_ALLOWED_EMAILS || '';
  return raw
    .split(',')
    .map((email) => normalizeEmail(email))
    .filter(Boolean);
}

export function canAccessQqInquiry(user?: { role?: string | null; email?: string | null } | null) {
  if (user?.role === 'admin') return true;

  const email = normalizeEmail(user?.email);
  if (!email) return false;

  return new Set([...QQ_INQUIRY_ALLOWED_EMAILS, ...configuredQqInquiryEmails()]).has(email);
}
