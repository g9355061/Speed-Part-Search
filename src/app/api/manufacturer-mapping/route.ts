import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getGenericCache, setGenericCacheOrThrow } from '@/lib/db';

type AliasMap = Record<string, string>;

// 對照表以 DB 為準——先前 runtime 寫回 src/data 檔案，Railway 磁碟是暫時性的，
// 部署一次同事編輯的對照就全部消失。內建 JSON 只作為首次遷移的種子。
const ALIAS_CACHE_KEY = 'manufacturer-aliases';
const ALIAS_FILE = path.join(process.cwd(), 'src/data/manufacturer-aliases.json');

function rowsFromAliases(aliases: AliasMap) {
  const grouped = new Map<string, string[]>();
  for (const [alias, canonical] of Object.entries(aliases)) {
    grouped.set(canonical, [...(grouped.get(canonical) ?? []), alias]);
  }
  return [...grouped.entries()]
    .map(([canonical, names]) => ({
      canonical,
      aliases: [...new Set([canonical, ...names])].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.canonical.localeCompare(b.canonical));
}

function sortAliases(aliases: AliasMap): AliasMap {
  return Object.fromEntries(
    Object.entries(aliases)
      .filter(([alias, canonical]) => alias.trim() && canonical.trim())
      .sort(([aliasA, canonicalA], [aliasB, canonicalB]) => (
        canonicalA.localeCompare(canonicalB) || aliasA.localeCompare(aliasB)
      )),
  );
}

async function readAliases(): Promise<AliasMap> {
  try {
    const dbAliases = await getGenericCache(ALIAS_CACHE_KEY);
    if (dbAliases && typeof dbAliases === 'object' && !Array.isArray(dbAliases)) {
      return dbAliases as AliasMap;
    }
  } catch (err) {
    console.error('[MANUFACTURER-MAPPING] Failed to read aliases from DB, falling back to seed file:', err);
  }
  const text = await readFile(ALIAS_FILE, 'utf8');
  return JSON.parse(text) as AliasMap;
}

export async function GET() {
  const aliases = await readAliases();
  return NextResponse.json({ aliases, rows: rowsFromAliases(aliases) });
}

export async function POST(request: Request) {
  const body = await request.json() as { aliases?: AliasMap };
  if (!body.aliases || typeof body.aliases !== 'object' || Array.isArray(body.aliases)) {
    return NextResponse.json({ error: 'Invalid aliases payload' }, { status: 400 });
  }

  const aliases = sortAliases(body.aliases);
  // 使用者資料：寫入失敗必須回錯誤，不能假裝已儲存
  try {
    await setGenericCacheOrThrow(ALIAS_CACHE_KEY, aliases);
  } catch (err) {
    console.error('[MANUFACTURER-MAPPING] Failed to persist aliases:', err);
    return NextResponse.json({ error: '對照表儲存失敗，請稍後再試' }, { status: 500 });
  }
  return NextResponse.json({ aliases, rows: rowsFromAliases(aliases) });
}
