import { NextRequest, NextResponse } from 'next/server';
import { getQqQuotesByMpn, saveQqQuote } from '@/lib/db';
import { requireQqInquiryUser } from '../session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 跨 Case 歷史報價：同料號在其他 Case 談到的價（詢價前的行情參考）
export async function GET(req: NextRequest) {
  const user = await requireQqInquiryUser();
  if (!user) return NextResponse.json({ error: '未授權' }, { status: 403 });

  const mpn = req.nextUrl.searchParams.get('mpn')?.trim();
  if (!mpn) return NextResponse.json({ error: '缺少料號' }, { status: 400 });
  const excludeCase = req.nextUrl.searchParams.get('excludeCase')?.trim() || undefined;

  const quotes = await getQqQuotesByMpn(mpn, excludeCase);
  return NextResponse.json({ quotes });
}

export async function POST(req: NextRequest) {
  const user = await requireQqInquiryUser();
  if (!user) return NextResponse.json({ error: '未授權' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求內容' }, { status: 400 });
  }

  const required = ['id', 'caseId', 'mpn', 'supplier'] as const;
  for (const key of required) {
    if (typeof body[key] !== 'string' || !(body[key] as string).trim()) {
      return NextResponse.json({ error: `缺少欄位 ${key}` }, { status: 400 });
    }
  }

  const quotedAt = typeof body.quotedAt === 'string' && !Number.isNaN(Date.parse(body.quotedAt))
    ? new Date(body.quotedAt).toISOString()
    : new Date().toISOString();
  const validUntil = typeof body.validUntil === 'string' && !Number.isNaN(Date.parse(body.validUntil))
    ? new Date(body.validUntil).toISOString()
    : null;

  const quote = {
    id: body.id as string,
    caseId: body.caseId as string,
    rfqId: typeof body.rfqId === 'string' && body.rfqId ? body.rfqId : null,
    mpn: body.mpn as string,
    qty: Number.isFinite(Number(body.qty)) ? Math.max(1, Math.round(Number(body.qty))) : 1,
    supplier: body.supplier as string,
    qq: typeof body.qq === 'string' && body.qq ? body.qq : null,
    manufacturer: typeof body.manufacturer === 'string' ? body.manufacturer : '',
    unitPrice: typeof body.unitPrice === 'string' ? body.unitPrice : '',
    stock: typeof body.stock === 'string' ? body.stock : '',
    moq: typeof body.moq === 'string' ? body.moq : '',
    leadTime: typeof body.leadTime === 'string' ? body.leadTime : '',
    rawReply: typeof body.rawReply === 'string' ? body.rawReply : '',
    quotedAt,
    validUntil,
    createdBy: user.name || user.email,
  };

  await saveQqQuote(quote);
  return NextResponse.json({ quote });
}
