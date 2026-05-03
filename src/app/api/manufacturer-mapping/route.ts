import { NextResponse } from 'next/server';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type AliasMap = Record<string, string>;

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
  await writeFile(ALIAS_FILE, `${JSON.stringify(aliases, null, 2)}\n`, 'utf8');
  return NextResponse.json({ aliases, rows: rowsFromAliases(aliases) });
}
