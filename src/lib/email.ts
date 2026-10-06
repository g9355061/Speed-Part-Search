import nodemailer from 'nodemailer';

const configured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const transporter = configured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

const FROM = process.env.SMTP_FROM || 'Speed Part Search <noreply@speedpartsearch.com>';
const SITE_URL = process.env.NEXTAUTH_URL || 'http://localhost:5280';

export const isEmailConfigured = configured || !!getGmailConfig();

/** 週報摘要投遞：Gmail API 優先，回傳郵件 ID；呼叫端按管理者分別寄送。 */
export async function sendWeeklyDigestEmail(recipients: string[], subject: string, text: string, html: string) {
  const gmail = getGmailConfig();
  if (gmail) return sendGmailDigest(gmail, recipients, subject, text, html);
  if (!transporter) throw new Error('Gmail API / SMTP 未設定');
  const info = await transporter.sendMail({ from: FROM, to: recipients.join(', '), subject, text, html });
  return info.messageId as string;
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const url = `${SITE_URL}/reset-password?token=${token}`;
  if (!transporter) {
    console.log(`[Email] Reset link for ${email}: ${url}`);
    return;
  }
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: '【Speed Part Search】密碼重設',
    html: `<p>您好，</p>
<p>請點擊以下連結完成密碼重設（1 小時內有效）：</p>
<p><a href="${url}">${url}</a></p>
<p>若您未申請此操作，請忽略此信件。</p>`,
  });
}

export async function sendApprovalEmail(email: string, name: string) {
  const url = `${SITE_URL}/login`;
  if (!transporter) {
    console.log(`[Email] Account approved: ${email}`);
    return;
  }
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: '【Speed Part Search】帳號已核准',
    html: `<p>${name} 您好，</p>
<p>您的 Speed Part Search 帳號申請已通過審核，請點擊以下連結登入：</p>
<p><a href="${url}">${url}</a></p>`,
  });
}

export async function sendRejectionEmail(email: string, name: string) {
  if (!transporter) {
    console.log(`[Email] Account rejected: ${email}`);
    return;
  }
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: '【Speed Part Search】帳號申請結果',
    html: `<p>${name} 您好，</p>
<p>很遺憾，您的 Speed Part Search 帳號申請未通過審核。</p>
<p>如有疑問，請聯絡管理員。</p>`,
  });
}

// 與 Issue Tracking System 相同的 Gmail OAuth / HTTPS 管道；Railway 無需 SMTP 連接埠。
function getGmailConfig() {
  const clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  const from = process.env.GMAIL_FROM;
  return clientId && clientSecret && refreshToken && from ? { clientId, clientSecret, refreshToken, from } : null;
}

let gmailToken: { value: string; expiresAt: number } | null = null;
async function sendGmailDigest(config: NonNullable<ReturnType<typeof getGmailConfig>>, recipients: string[], subject: string, text: string, html: string): Promise<string> {
  if (!gmailToken || gmailToken.expiresAt < Date.now() + 60_000) {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: config.refreshToken, grant_type: 'refresh_token' }),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok || !data.access_token) throw new Error(`Gmail OAuth 驗證失敗（HTTP ${response.status}）`);
    gmailToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  }
  // Nodemailer 產生 RFC MIME：保留純文字、HTML、中文標題及寄件者名稱。
  const composer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' });
  const message = await composer.sendMail({ from: config.from, to: recipients, subject, text, html });
  if (!Buffer.isBuffer(message.message)) throw new Error('郵件 MIME 產生失敗');
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${gmailToken.value}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: Buffer.from(message.message).toString('base64url') }),
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok || !data.id) throw new Error(`Gmail API 寄信失敗（HTTP ${response.status}）`);
  return data.id;
}
