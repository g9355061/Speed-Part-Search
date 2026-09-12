import { getGenericCache, setGenericCache, type SnapshotPoint } from '@/lib/db';
import { BENCHMARK_PARTS, DEMAND_CATEGORIES, type BenchmarkPart, type PartRole } from './benchmark';
import { computeZeroStreak } from './risk';
import { classifyHotPart, type FenghuoHotPartView } from './fenghuo';

/**
 * 基準料名單的「指數成分維護」（2026-09-13，Danny：150 顆只是隨機抽樣，換一顆沒那麼嚴重）
 *
 * 像 S&P 500 的成分審查，但全自動：
 *   除名（每週在 mode=full 之前跑）
 *     - eol      生命週期 EOL / LTB / NRND
 *     - zero4    連續 ≥4 次快照庫存為 0（代理商未備貨）
 *     - nodata4  連續 ≥4 次快照無代理商資料
 *     - flat8    連續 ≥8 次快照庫存與價格完全不動（死訊號）
 *   遞補（每類補到配額；候選依序）
 *     1. 華強烽火熱料連續 ≥3 週在榜、歸到該類別——市場真的在交易的料
 *     2. 站內 90 天搜尋 ≥3 次的料——自家真的在找的料
 *     候選須經 DigiKey/Mouser 查驗：查得到、Active、有庫存。26 週內被除名的不再納入。
 *
 * 名單＝程式內的靜態底稿（benchmark.ts）＋ DB 覆蓋層（removed / added）。
 * 所有伺服器端程式一律用 getActiveBenchmarkParts()；靜態 BENCHMARK_PARTS 只當底稿與前端載入前的佔位。
 */

export const ROSTER_KEY = 'benchmark-roster-v1';
export const DELIST_ZERO_WEEKS = 4;
export const DELIST_NODATA_WEEKS = 4;
export const DELIST_FLAT_WEEKS = 8;
export const READD_COOLDOWN_WEEKS = 26;
export const FENGHUO_MIN_WEEKS = 3;
export const SEARCH_MIN_COUNT = 3;
export const MAX_VALIDATIONS_PER_RUN = 12; // 每次最多查驗幾顆候選（DigiKey/Mouser 額度）

export interface RosterEntryRemoved { mpn: string; categoryId: string; reason: string; at: string }
export interface RosterLogEntry { at: string; action: 'remove' | 'add'; mpn: string; categoryId: string; reason: string }

export interface RosterOverrides {
  version: 1;
  updatedAt: string;
  removed: RosterEntryRemoved[];
  added: BenchmarkPart[];
  log: RosterLogEntry[];
}

const EMPTY_ROSTER: RosterOverrides = { version: 1, updatedAt: '', removed: [], added: [], log: [] };

/**
 * 類別配額：每類 20 顆（2026-09-13 Danny 定）。理由：類別「有貨比例」10 顆時一顆就是 10 個百分點，
 * 單週跳動太大；20 顆才能穩定偵測 15–20 點的變化。API 額度不是瓶頸（DigiKey/Mouser 各 1,000 次/天，
 * 每週 300 顆只用 2%）。缺額由遞補機制逐週補到有候選為止，不強求一次補滿。
 */
export const CATEGORY_QUOTA_DEFAULT = 20;
export const CATEGORY_QUOTA: Record<string, number> = Object.fromEntries(
  DEMAND_CATEGORIES.map((c) => [c.categoryId, CATEGORY_QUOTA_DEFAULT])
);

export async function readRoster(): Promise<RosterOverrides> {
  try {
    const cached = await getGenericCache(ROSTER_KEY);
    if (cached && cached.version === 1) {
      return { ...EMPTY_ROSTER, ...cached, removed: cached.removed ?? [], added: cached.added ?? [], log: cached.log ?? [] };
    }
  } catch (err) {
    console.warn('[Roster] read failed:', err);
  }
  return { ...EMPTY_ROSTER };
}

export async function writeRoster(roster: RosterOverrides) {
  await setGenericCache(ROSTER_KEY, { ...roster, log: roster.log.slice(-200) });
}

export function applyRoster(base: BenchmarkPart[], roster: RosterOverrides): BenchmarkPart[] {
  const removed = new Set(roster.removed.map((r) => r.mpn.toUpperCase()));
  const seen = new Set<string>();
  const out: BenchmarkPart[] = [];
  for (const p of [...base, ...roster.added]) {
    const key = p.mpn.toUpperCase();
    if (removed.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/** 現行名單（底稿 − 除名 ＋ 遞補） */
export async function getActiveBenchmarkParts(): Promise<BenchmarkPart[]> {
  return applyRoster(BENCHMARK_PARTS, await readRoster());
}

// ==================== 除名判定 ====================

export interface DelistDecision { mpn: string; categoryId: string; reason: string }

function isEolStatus(status: string | null | undefined) {
  return /obsolete|discontinu|end.of.life|\beol\b|nrnd|not recommended|last time/i.test(String(status ?? ''));
}

export function decideDelistings(
  parts: BenchmarkPart[],
  history: Record<string, SnapshotPoint[]>,
  partsCache: any[] | null | undefined
): DelistDecision[] {
  const cached = new Map<string, any>((partsCache ?? []).map((p: any) => [String(p.mpn).toUpperCase(), p]));
  const out: DelistDecision[] = [];
  for (const part of parts) {
    const snaps = history[part.mpn] ?? [];
    const c = cached.get(part.mpn.toUpperCase());
    const lifecycle = c?.lifecycleStatus ?? null;
    if (isEolStatus(lifecycle)) { out.push({ mpn: part.mpn, categoryId: part.categoryId, reason: `eol:${lifecycle}` }); continue; }
    if (snaps.length >= DELIST_NODATA_WEEKS) {
      // 無代理商資料要先判（它的庫存也是 0，否則會被算成 zero4）
      const tail = snaps.slice(-DELIST_NODATA_WEEKS);
      if (tail.every((s) => !(Number(s.supplierCount) > 0) || s.riskLevel === '無資料')) {
        out.push({ mpn: part.mpn, categoryId: part.categoryId, reason: `nodata${DELIST_NODATA_WEEKS}:連續 ${tail.length} 次快照無代理商資料` }); continue;
      }
    }
    if (snaps.length >= DELIST_ZERO_WEEKS) {
      const zero = computeZeroStreak(snaps);
      if (zero >= DELIST_ZERO_WEEKS) { out.push({ mpn: part.mpn, categoryId: part.categoryId, reason: `zero${DELIST_ZERO_WEEKS}:連續 ${zero} 次快照庫存為 0` }); continue; }
    }
    if (snaps.length >= DELIST_FLAT_WEEKS) {
      const recent = snaps.slice(-DELIST_FLAT_WEEKS);
      const flat = recent.every((s) => s.totalStock === recent[0].totalStock && s.price === recent[0].price);
      if (flat) { out.push({ mpn: part.mpn, categoryId: part.categoryId, reason: `flat${DELIST_FLAT_WEEKS}:連續 ${recent.length} 次快照庫存與價格完全不動` }); continue; }
    }
  }
  return out;
}

// ==================== 遞補候選 ====================

export interface Candidate { mpn: string; categoryId: string; source: 'fenghuo' | 'search'; role: PartRole; note: string; manufacturerHint?: string }

export function buildCandidates(
  active: BenchmarkPart[],
  roster: RosterOverrides,
  hotParts: FenghuoHotPartView[],
  topSearched: Array<{ mpn: string; count: number }>,
  now = new Date()
): Candidate[] {
  const inRoster = new Set(active.map((p) => p.mpn.toUpperCase()));
  const cooldownCutoff = now.getTime() - READD_COOLDOWN_WEEKS * 7 * 86400000;
  const recentlyRemoved = new Set(roster.removed.filter((r) => Date.parse(r.at) > cooldownCutoff).map((r) => r.mpn.toUpperCase()));
  const seen = new Set<string>();
  const out: Candidate[] = [];
  const push = (c: Candidate) => {
    const key = c.mpn.toUpperCase();
    if (inRoster.has(key) || recentlyRemoved.has(key) || seen.has(key) || !c.categoryId) return;
    seen.add(key);
    out.push(c);
  };
  for (const p of [...hotParts].sort((a, b) => b.weeksOnList - a.weeksOnList)) {
    if (p.weeksOnList >= FENGHUO_MIN_WEEKS && p.categoryId) {
      push({ mpn: p.mpn, categoryId: p.categoryId, source: 'fenghuo', role: 'thermometer', note: `華強熱料連續 ${p.weeksOnList} 週在榜`, manufacturerHint: p.brand });
    }
  }
  for (const t of [...topSearched].sort((a, b) => b.count - a.count)) {
    if (t.count < SEARCH_MIN_COUNT) continue;
    const categoryId = classifyHotPart(t.mpn, '');
    if (categoryId) push({ mpn: t.mpn.toUpperCase(), categoryId, source: 'search', role: 'field', note: `站內 90 天搜尋 ${t.count} 次` });
  }
  return out;
}

export function vacanciesByCategory(active: BenchmarkPart[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const cat of DEMAND_CATEGORIES) {
    const have = active.filter((p) => p.categoryId === cat.categoryId).length;
    out[cat.categoryId] = Math.max(0, (CATEGORY_QUOTA[cat.categoryId] ?? have) - have);
  }
  return out;
}

export interface ValidationResult { ok: boolean; manufacturer?: string; description?: string; reason?: string }
export type CandidateValidator = (mpn: string) => Promise<ValidationResult>;

export interface RebalanceReport {
  at: string;
  before: number;
  after: number;
  removed: DelistDecision[];
  added: Array<Candidate & { manufacturer: string }>;
  rejected: Array<Candidate & { reason: string }>;
  vacancies: Record<string, number>;
  validationsUsed: number;
}

/**
 * 一次完整的成分審查：除名 → 算缺額 → 候選查驗 → 遞補 → 寫回 DB。
 * validate 由呼叫端注入（正式為 DigiKey/Mouser 查詢；測試可給假的）。
 */
export async function rebalanceRoster(input: {
  history: Record<string, SnapshotPoint[]>;
  partsCache: any[] | null | undefined;
  hotParts: FenghuoHotPartView[];
  topSearched: Array<{ mpn: string; count: number }>;
  validate: CandidateValidator;
  now?: Date;
  dryRun?: boolean;
}): Promise<RebalanceReport> {
  const now = input.now ?? new Date();
  const at = now.toISOString();
  const roster = await readRoster();
  const before = applyRoster(BENCHMARK_PARTS, roster);

  const removed = decideDelistings(before, input.history, input.partsCache);
  for (const d of removed) {
    roster.removed.push({ mpn: d.mpn, categoryId: d.categoryId, reason: d.reason, at });
    roster.added = roster.added.filter((p) => p.mpn.toUpperCase() !== d.mpn.toUpperCase());
    roster.log.push({ at, action: 'remove', mpn: d.mpn, categoryId: d.categoryId, reason: d.reason });
  }

  let active = applyRoster(BENCHMARK_PARTS, roster);
  const vacancies = vacanciesByCategory(active);
  const candidates = buildCandidates(active, roster, input.hotParts, input.topSearched, now);
  const added: RebalanceReport['added'] = [];
  const rejected: RebalanceReport['rejected'] = [];
  let validationsUsed = 0;

  for (const c of candidates) {
    if ((vacancies[c.categoryId] ?? 0) <= 0) continue;
    if (validationsUsed >= MAX_VALIDATIONS_PER_RUN) break;
    validationsUsed += 1;
    let result: ValidationResult;
    try {
      result = await input.validate(c.mpn);
    } catch (err) {
      result = { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
    if (!result.ok) { rejected.push({ ...c, reason: result.reason ?? '查驗未通過' }); continue; }
    const cat = DEMAND_CATEGORIES.find((x) => x.categoryId === c.categoryId)!;
    const part: BenchmarkPart = {
      categoryId: c.categoryId, category: cat.category, subCategory: cat.subCategory,
      mpn: c.mpn, manufacturer: result.manufacturer || c.manufacturerHint || '',
      family: result.description?.slice(0, 60) || c.note, role: c.role,
    };
    roster.added.push(part);
    roster.log.push({ at, action: 'add', mpn: c.mpn, categoryId: c.categoryId, reason: `${c.note}（${c.source}）` });
    vacancies[c.categoryId] -= 1;
    added.push({ ...c, manufacturer: part.manufacturer });
  }

  active = applyRoster(BENCHMARK_PARTS, roster);
  roster.updatedAt = at;
  if (!input.dryRun && (removed.length > 0 || added.length > 0)) await writeRoster(roster);

  return { at, before: before.length, after: active.length, removed, added, rejected, vacancies, validationsUsed };
}
