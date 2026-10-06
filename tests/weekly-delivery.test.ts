import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { weeklyDeliveryRecipients } from '../src/lib/demand-forecast/weekly-delivery-policy';

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'weekly-delivery-test-'));
  delete process.env.DATABASE_URL;
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.CRON_SECRET = 'isolated-test-secret';
  process.env.GMAIL_CLIENT_ID = 'test-client';
  process.env.GMAIL_CLIENT_SECRET = 'test-secret';
  process.env.GMAIL_REFRESH_TOKEN = 'test-refresh';
  process.env.GMAIL_FROM = 'Speed Part Search <sender@example.com>';
  process.env.WEEKLY_REPORT_EMAIL_ENABLED = 'false';
  process.env.WEEKLY_REPORT_WEBHOOK_URL = 'https://example.com/group';
  const users = [
    { email: ' Admin@Example.com ', role: 'admin' as const, status: 'active' as const },
    { email: 'admin@example.com', role: 'admin' as const, status: 'active' as const },
    { email: 'pending@example.com', role: 'admin' as const, status: 'pending' as const },
    { email: 'member@example.com', role: 'user' as const, status: 'active' as const },
  ];
  assert.deepEqual(weeklyDeliveryRecipients(users, false, false), []);
  assert.deepEqual(weeklyDeliveryRecipients(users, false, true), ['admin@example.com']);
  assert.deepEqual(weeklyDeliveryRecipients(users, true, false), ['g9355061@gmail.com']);
  const { POST } = await import('../src/app/api/demand-forecast/weekly-reports/deliver/route');
  const { setGenericCacheOrThrow, getGenericCache, claimWeeklyDelivery } = await import('../src/lib/db');
  const taipei = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const day = taipei.getUTCDay();
  taipei.setUTCDate(taipei.getUTCDate() + (day === 0 ? -6 : 1 - day));
  const id = 'weekly-' + taipei.toISOString().slice(0, 10);
  await setGenericCacheOrThrow(`weekly-report-built-${id}`, { rev: 9, builtAt: Date.now(), report: {
    id, title: '物料預測週報｜測試｜中文內容', href: '/demand-forecast/weekly-reports/' + id, date: '2026/10/05', summary: '<測試 & 摘要>', riskLevel: 'normal',
    executiveItems: [], metrics: { partsWithSnapshot: 1 }, sourceLinks: [],
  } });
  const calls: { url: string; raw?: string }[] = [];
  let rejectSend = false;
  globalThis.fetch = (async (url, options) => {
    const target = String(url);
    calls.push({ url: target, raw: options?.body && target.includes('messages/send') ? JSON.parse(String(options.body)).raw : undefined });
    if (target.includes('oauth2')) return Response.json({ access_token: 'fake-access', expires_in: 3600 });
    if (target.includes('messages/send')) return rejectSend ? Response.json({}, { status: 503 }) : Response.json({ id: 'mock-message-' + calls.length });
    return new Response('ok');
  }) as typeof fetch;
  const req = (query = '', auth = true) => new NextRequest('https://example.com/api/demand-forecast/weekly-reports/deliver' + query, { method: 'POST', headers: auth ? { 'x-cron-secret': 'isolated-test-secret' } : {} });
  assert.equal((await POST(req('', false))).status, 401);
  assert.equal((await (await POST(req())).json()).disabled, true);
  assert.equal(calls.length, 0, '關閉時不寄信也不送 webhook');
  const preview = await (await POST(req('?test=1&preview=1'))).json();
  assert.deepEqual(preview.recipients, ['g9355061@gmail.com']);
  assert.ok(preview.html.includes('&lt;測試 &amp; 摘要&gt;'));
  assert.equal(calls.length, 0);
  const tested = await (await POST(req('?test=1'))).json();
  assert.equal(tested.delivered, true);
  assert.deepEqual(Object.keys(tested.results), ['g9355061@gmail.com']);
  assert.equal(calls.filter(c => c.url.includes('/group')).length, 0, '測試不能通知群組');
  const mime = Buffer.from(calls.find(c => c.raw)!.raw!, 'base64url').toString();
  assert.ok(mime.includes('To: g9355061@gmail.com'));
  assert.ok(mime.includes('multipart/alternative'));
  assert.ok(mime.includes('text/plain; charset=utf-8'));
  assert.ok(mime.includes('text/html; charset=utf-8'));
  assert.equal((await (await POST(req('?test=1'))).json()).delivered, false, '同一期測試不重複');
  assert.equal((await (await POST(req('?test=1&force=1'))).json()).delivered, true);
  process.env.WEEKLY_REPORT_EMAIL_ENABLED = 'true';
  const live = await (await POST(req())).json();
  assert.equal(live.delivered, true);
  assert.deepEqual(Object.keys(live.results).sort(), ['g9355061@gmail.com', 'group', 'weili_chang@yangshin.com'].sort(), '測試不占正式投遞');
  assert.equal((await (await POST(req())).json()).delivered, false);
  rejectSend = true;
  const failed = await POST(req('?test=1&force=1'));
  assert.equal(failed.status, 502);
  const key = `weekly-report-delivery-test-${id}-email-g9355061@gmail.com`;
  assert.equal((await getGenericCache(key)).status, 'failed');
  rejectSend = false;
  assert.equal((await (await POST(req('?test=1'))).json()).delivered, true, '明確拒絕可重試');
  const claims = await Promise.all(Array.from({ length: 5 }, () => claimWeeklyDelivery('concurrent-delivery')));
  assert.equal(claims.filter(Boolean).length, 1, '重疊請求只保留一次');
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('weekly delivery: recipient approval gate, cron auth, preview, Gmail MIME, test isolation, idempotence, failure retry, atomic claim passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
