import { NextRequest, NextResponse } from 'next/server';
import { deleteQqCase, QqBomRowRecord, updateQqCaseBom } from '@/lib/db';
import { requireQqInquiryUser } from '../../session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 同名檔案的新版本：取代 BOM 內容、保留既有報價
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireQqInquiryUser();
  if (!user) return NextResponse.json({ error: '未授權' }, { status: 403 });

  let body: { contentHash?: string; bomRows?: QqBomRowRecord[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求內容' }, { status: 400 });
  }
  if (typeof body.contentHash !== 'string' || !body.contentHash || !Array.isArray(body.bomRows) || !body.bomRows.length) {
    return NextResponse.json({ error: '缺少內容 hash 或 BOM 內容' }, { status: 400 });
  }

  await updateQqCaseBom(params.id, body.contentHash, body.bomRows);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireQqInquiryUser();
  if (!user) return NextResponse.json({ error: '未授權' }, { status: 403 });

  await deleteQqCase(params.id);
  return NextResponse.json({ ok: true });
}
