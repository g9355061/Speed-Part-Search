import { NextRequest, NextResponse } from 'next/server';
import {
  createQqCase,
  findQqCaseByFileName,
  findQqCaseByHash,
  listQqCases,
  QqBomRowRecord,
  QqQuoteRecord,
} from '@/lib/db';
import { requireQqInquiryUser } from '../session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isValidBomRows(value: unknown): value is QqBomRowRecord[] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((row) => row && typeof row.mpn === 'string' && row.mpn.trim() && Number.isFinite(row.qty));
}

const str = (value: unknown) => (typeof value === 'string' ? value : '');
const isoOr = (value: unknown, fallback: string | null) =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : fallback;

// localStorage 舊報價欄位可能缺漏，寫入 DB 前補齊預設值
function normalizeMigratedQuotes(quotes: unknown, fallbackBy: string): Omit<QqQuoteRecord, 'caseId'>[] {
  if (!Array.isArray(quotes)) return [];
  return quotes.flatMap((q: any) => {
    if (!q || typeof q.mpn !== 'string' || !q.mpn.trim() || typeof q.supplier !== 'string' || !q.supplier.trim()) return [];
    return [{
      id: str(q.id) || `${q.mpn}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      rfqId: str(q.rfqId) || null,
      mpn: q.mpn as string,
      qty: Number.isFinite(Number(q.qty)) ? Math.max(1, Math.round(Number(q.qty))) : 1,
      supplier: q.supplier as string,
      qq: str(q.qq) || null,
      manufacturer: str(q.manufacturer),
      unitPrice: str(q.unitPrice),
      stock: str(q.stock),
      moq: str(q.moq),
      leadTime: str(q.leadTime),
      rawReply: str(q.rawReply),
      quotedAt: isoOr(q.quotedAt, null) ?? new Date().toISOString(),
      validUntil: isoOr(q.validUntil, null),
      createdBy: str(q.createdBy) || fallbackBy,
    }];
  });
}

export async function GET() {
  const user = await requireQqInquiryUser();
  if (!user) return NextResponse.json({ error: '未授權' }, { status: 403 });
  const data = await listQqCases();
  return NextResponse.json(data);
}

// 建立 Case。內容 hash（解析後料號×數量的 SHA-256）為第一道去重：
// hash 相同＝同一份需求 → 409 引導開啟既有 Case；檔名相同但內容不同 → 409 引導更新為新版本。
// force=true 略過去重；帶 id 為 localStorage 舊資料搬遷（已存在則跳過）。
export async function POST(req: NextRequest) {
  const user = await requireQqInquiryUser();
  if (!user) return NextResponse.json({ error: '未授權' }, { status: 403 });

  let body: {
    id?: string;
    fileName?: string;
    contentHash?: string;
    bomRows?: unknown;
    force?: boolean;
    status?: string;
    createdAt?: string;
    quotes?: Omit<QqQuoteRecord, 'caseId'>[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求內容' }, { status: 400 });
  }

  const { id, fileName, contentHash, bomRows, force, status, createdAt, quotes } = body;
  if (typeof fileName !== 'string' || !fileName.trim() || typeof contentHash !== 'string' || !contentHash) {
    return NextResponse.json({ error: '缺少檔名或內容 hash' }, { status: 400 });
  }
  if (!isValidBomRows(bomRows)) {
    return NextResponse.json({ error: 'BOM 內容無效' }, { status: 400 });
  }

  if (!force && !id) {
    const hashDuplicate = await findQqCaseByHash(contentHash);
    if (hashDuplicate) {
      return NextResponse.json({ duplicate: 'hash', case: hashDuplicate }, { status: 409 });
    }
    const nameDuplicate = await findQqCaseByFileName(fileName);
    if (nameDuplicate) {
      return NextResponse.json({ duplicate: 'filename', case: nameDuplicate }, { status: 409 });
    }
  }

  const created = await createQqCase({
    id,
    fileName,
    contentHash,
    bomRows,
    createdBy: user.name || user.email,
    status: typeof status === 'string' ? status : undefined,
    createdAt: isoOr(createdAt, null) ?? undefined,
    quotes: normalizeMigratedQuotes(quotes, user.name || user.email),
  });
  if (!created) {
    // 搬遷重跑：該 id 已存在，視為已完成
    return NextResponse.json({ exists: true });
  }
  return NextResponse.json({ case: created });
}
