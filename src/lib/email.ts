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
