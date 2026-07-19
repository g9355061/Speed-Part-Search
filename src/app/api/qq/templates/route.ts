import { NextRequest, NextResponse } from 'next/server';
import { listQqTemplates, saveQqTemplate, deleteQqTemplate } from '@/lib/db';
import { requireQqInquiryUser } from '../session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 團隊共享的自訂詢價模板。系統預設模板（DEFAULT_TEMPLATES）以程式碼為準、不入庫，
// 這裡只存使用者自建模板（如「報價模板二」）——先前存 localStorage，同事間彼此看不到。
export async function GET() {
  const user = await requireQqInquiryUser();
  if (!user) return NextResponse.json({ error: '未授權' }, { status: 403 });
  const templates = await listQqTemplates();
  return NextResponse.json({ templates });
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
  for (const key of ['id', 'name', 'content'] as const) {
    if (typeof body[key] !== 'string' || !(body[key] as string).trim()) {
      return NextResponse.json({ error: `缺少欄位 ${key}` }, { status: 400 });
    }
  }
  // 系統預設模板 id 不可被覆寫入庫
  if ((body.id as string) === 'default') {
    return NextResponse.json({ error: '系統預設模板不可修改' }, { status: 400 });
  }

  await saveQqTemplate({
    id: body.id as string,
    name: (body.name as string).trim(),
    content: body.content as string,
    createdBy: user.name || user.email,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await requireQqInquiryUser();
  if (!user) return NextResponse.json({ error: '未授權' }, { status: 403 });

  const id = req.nextUrl.searchParams.get('id')?.trim();
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
  if (id === 'default') return NextResponse.json({ error: '系統預設模板不可刪除' }, { status: 400 });

  await deleteQqTemplate(id);
  return NextResponse.json({ ok: true });
}
