import rawManufacturerAliases from '@/data/manufacturer-aliases.json';

export const MANUFACTURER_ALIASES: Record<string, string> = rawManufacturerAliases;

export type ManufacturerMatchKind = 'empty' | 'exact' | 'alias' | 'fuzzy' | 'mismatch';

export interface ManufacturerMatch {
  kind: ManufacturerMatchKind;
  score: number;
  reason?: string;
}

export function normalizeManufacturer(value?: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(incorporated|corporation|corp|inc|ltd|limited|co|company|llc|plc|nv)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function canonicalManufacturer(value?: string, aliases: Record<string, string> = MANUFACTURER_ALIASES): string {
  const normalized = normalizeManufacturer(value);
  return aliases[normalized] ?? normalized;
}

export function isWordContained(a: string, b: string): boolean {
  if (!a || !b) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= 4 && new RegExp(`(^| )${shorter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(longer);
}

export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        last + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      last = temp;
    }
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

export function manufacturerMatch(bomManufacturer?: string, apiManufacturer?: string, aliases: Record<string, string> = MANUFACTURER_ALIASES): ManufacturerMatch {
  const bomRaw = normalizeManufacturer(bomManufacturer);
  const apiRaw = normalizeManufacturer(apiManufacturer);
  if (!bomRaw) return { kind: 'empty', score: 1 };
  if (!apiRaw) return { kind: 'mismatch', score: 0, reason: `BOM: ${bomManufacturer || '-'} / API: ${apiManufacturer || '-'}` };

  if (bomRaw === apiRaw) return { kind: 'exact', score: 1 };

  const bom = canonicalManufacturer(bomManufacturer, aliases);
  const api = canonicalManufacturer(apiManufacturer, aliases);
  if (bom && api && bom === api) return { kind: 'alias', score: 1 };
  if (isWordContained(bom, api) || isWordContained(bomRaw, apiRaw)) return { kind: 'alias', score: 1 };

  const score = Math.max(similarity(bomRaw, apiRaw), similarity(bom, api));
  const reason = `BOM: ${bomManufacturer || '-'} / API: ${apiManufacturer || '-'} / 相似度 ${Math.round(score * 100)}%`;
  if (score >= 0.92) return { kind: 'fuzzy', score, reason };
  if (score >= 0.82) return { kind: 'fuzzy', score, reason };
  return { kind: 'mismatch', score, reason };
}

export function manufacturerMappingRows() {
  const grouped = new Map<string, string[]>();
  for (const [alias, canonical] of Object.entries(MANUFACTURER_ALIASES)) {
    grouped.set(canonical, [...(grouped.get(canonical) ?? []), alias]);
  }
  return [...grouped.entries()]
    .map(([canonical, aliases]) => ({
      canonical,
      aliases: [...new Set([canonical, ...aliases])].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.canonical.localeCompare(b.canonical));
}
