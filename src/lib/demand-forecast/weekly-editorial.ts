/**
 * 週報編輯流程（2026-11-12，REPORT_BUILD_REV 12）：選題 → 撰稿 → 審稿。
 *
 * 以前把全部素材一次丟給 Gemini，讓它同時決定「什麼重要」與「怎麼寫」，結果 11/09 期拿
 * ST 新品發表當大標、4 家媒體報導的 MLCC 短缺卻落到「本週要聞」。這裡把「編輯」與「查證」
 * 兩個角色從提示詞裡抽出來，變成程式規則＋第二次 AI 呼叫：
 *   1. 選題：新聞分成供應事件／產品發表／其他，依「幾家媒體報導」排序，決定封面順序。
 *   2. 素材合理性：華強熱搜參考價明顯離譜的不引用；本站通路觀測只給質性描述（不帶數字）。
 *   3. 落差：新聞喊缺但通路沒反映（或相反）時，把落差本身交代給撰稿模型。
 *   4. 審稿：程式規則＋AI 逐句對照素材；不過關的期別不自動寄送。
 * 本檔除 reviewWeeklyIssueWithGemini 外皆為純函式，測試見 tests/weekly-editorial.test.ts。
 */

export type NewsKind = 'supply' | 'launch' | 'other';

// 強供應詞：出現就是供應事件，即使同時像產品發表
const STRONG_SUPPLY = /短缺|缺貨|缺料|漲價|調漲|調升|減產|停產|供不應求|售罄|吃緊|緊缺|配額|shortage|price hike|price increase|allocation|sold out/i;
const WEAK_SUPPLY = /交期|產能|庫存|合約價|現貨價|lead time|capacity|inventory|supply constraint|tight supply/i;
const LAUNCH = /推出|發表|發布|新品|全新|問世|亮相|首款|第一個|第一款|launch|introduc|unveil|debut|announces? (?:a |the )?new/i;

export function classifyNewsKind(text: string): NewsKind {
  if (STRONG_SUPPLY.test(text)) return 'supply';
  if (LAUNCH.test(text)) return 'launch';
  if (WEAK_SUPPLY.test(text)) return 'supply';
  return 'other';
}

function titleTokens(title: string): Set<string> {
  const tokens = new Set<string>();
  const lower = title.toLowerCase();
  for (const word of lower.match(/[a-z0-9]{2,}/g) ?? []) tokens.add(word);
  const cjk = lower.replace(/[^一-鿿]/g, '');
  for (let i = 0; i < cjk.length - 1; i++) tokens.add(cjk.slice(i, i + 2));
  return tokens;
}

/** 兩則標題的重疊係數（交集 / 較短者），用來判斷是不是同一事件的不同媒體報導 */
export function titleSimilarity(a: string, b: string): number {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const token of ta) if (tb.has(token)) shared += 1;
  return shared / Math.min(ta.size, tb.size);
}

const SAME_EVENT_SIMILARITY = 0.4;

export interface RankedNewsEvent<T> {
  item: T;                 // 代表報導（群內第一則）
  kind: NewsKind;
  sources: string[];       // 報導同一事件的不同媒體
  score: number;
}

export interface CategoryNewsRanking<T> {
  events: RankedNewsEvent<T>[];  // 依份量由高到低
  supplySources: number;         // 本類別本週報導供應面消息的不同媒體數
  launchOnly: boolean;           // 有新聞，但全是產品發表
  score: number;                 // 類別的新聞份量
}

interface NewsLike { title?: string; titleZh?: string; snippet?: string; snippetZh?: string; source?: string }

/**
 * 單一類別的新聞選題：同一事件的多家報導併成一則，供應事件優先、產品發表墊底。
 * 類別份量以「幾家不同媒體在報供應面消息」為主——比單看則數不怕同一家洗版。
 */
export function rankCategoryNews<T extends NewsLike>(items: T[]): CategoryNewsRanking<T> {
  const textOf = (item: T) => `${item.titleZh || ''} ${item.title || ''} ${item.snippetZh || ''} ${item.snippet || ''}`;
  const titleOf = (item: T) => item.titleZh || item.title || '';
  const clusters: Array<{ items: T[]; kind: NewsKind }> = [];
  for (const item of items) {
    const kind = classifyNewsKind(textOf(item));
    const home = clusters.find((cluster) =>
      cluster.items.some((other) => titleSimilarity(titleOf(other), titleOf(item)) >= SAME_EVENT_SIMILARITY));
    if (home) {
      home.items.push(item);
      if (kind === 'supply') home.kind = 'supply';
    } else {
      clusters.push({ items: [item], kind });
    }
  }
  const sourcesOf = (list: T[]) => Array.from(new Set(list.map((item) => (item.source || '').trim()).filter(Boolean)));
  const events = clusters.map((cluster) => {
    const sources = sourcesOf(cluster.items);
    const breadth = Math.max(sources.length, 1);
    const score = cluster.kind === 'supply' ? 10 + breadth * 10 : cluster.kind === 'other' ? 3 + breadth * 2 : 0;
    return { item: cluster.items[0], kind: cluster.kind, sources, score };
  }).sort((a, b) => b.score - a.score);

  const supplyItems = clusters.filter((cluster) => cluster.kind === 'supply').flatMap((cluster) => cluster.items);
  const supplySources = supplyItems.length > 0 ? Math.max(sourcesOf(supplyItems).length, 1) : 0;
  const otherEvents = events.filter((event) => event.kind === 'other').length;
  return {
    events,
    supplySources,
    launchOnly: events.length > 0 && events.every((event) => event.kind === 'launch'),
    // 只要有供應面報導就先給底分：單一來源的供應新聞也要排在「只有熱搜」的類別前面
    // （正式站實測：新聞窗內 MLCC 只剩 1 家報導時，會輸給交叉命中＋熱搜的類比 IC）
    score: (supplySources > 0 ? 10 : 0) + supplySources * 10 + Math.min(otherEvents, 3) * 3,
  };
}

export interface CoverCandidate {
  newsScore: number;
  crossHit: boolean;
  lifecycleCount: number;
  marketReportCount: number;
  hotSustained: number;   // 華強熱料連續 ≥2 次在榜的顆數
  hotNew: number;         // 只在本次快照出現（單日熱搜）
}

/** 封面順序分數：外部新聞份量為主，通路交叉命中與持續熱搜為輔；單日熱搜幾乎不加分 */
export function coverScore(c: CoverCandidate): number {
  return c.newsScore
    + c.lifecycleCount * 4
    + c.marketReportCount * 2
    + (c.crossHit ? 8 : 0)
    + Math.min(c.hotSustained, 3) * 3
    + (c.hotNew > 0 ? 1 : 0);
}

// 單顆晶片上千元人民幣只在這幾類合理（記憶體模組、處理器／FPGA、電源模組）
const HIGH_PRICE_CATEGORIES = new Set(['C04', 'C05', 'C15']);
const SUSPECT_PRICE_CNY = 1000;
const SUSPECT_PEER_RATIO = 20;

/**
 * 華強熱搜參考價合理性：回傳「價格不可引用」的料號。
 * 11/09 期把 TPA6304QDDVRQ1（車用音訊放大器）的 ¥2200 寫成「現貨飆至」——那比較像佔位價或整盤價。
 */
export function suspectHotPrices(parts: Array<{ mpn: string; priceCny: number | null; categoryId: string | null }>): Set<string> {
  const suspect = new Set<string>();
  for (const part of parts) {
    if (part.priceCny == null) continue;
    if (part.priceCny >= SUSPECT_PRICE_CNY && !(part.categoryId && HIGH_PRICE_CATEGORIES.has(part.categoryId))) {
      suspect.add(part.mpn);
      continue;
    }
    const peers = parts
      .filter((other) => other.mpn !== part.mpn && other.categoryId === part.categoryId && other.priceCny != null)
      .map((other) => other.priceCny as number)
      .sort((a, b) => a - b);
    if (peers.length >= 2) {
      const median = peers[Math.floor(peers.length / 2)];
      if (median > 0 && part.priceCny > median * SUSPECT_PEER_RATIO) suspect.add(part.mpn);
    }
  }
  return suspect;
}

export interface ChannelState {
  level: string;                 // high | medium | normal | insufficient
  trend?: string;                // 含 'loosening' 時為轉鬆
  pending: boolean;
  consecutiveTightWeeks: number;
  externalPrimary: boolean;
}

export function channelIsTight(state?: ChannelState | null): boolean {
  return !!state && !state.pending && (state.level === 'high' || state.level === 'medium');
}

/**
 * 給撰稿模型的本站通路觀測：只有質性描述，不帶任何數字。
 * 可得性指數的原文（「交期 +16 週」）是類別中位數的變化，模型拿到數字就會寫成
 * 「交期拉長 16 週」的標題與「提前 16 週下單」的行動建議，誤導採購。
 */
export function qualitativeChannelText(label: string, state: ChannelState | null | undefined, eventText: string): string {
  const parts: string[] = [];
  if (state && state.level !== 'insufficient') {
    if (channelIsTight(state)) parts.push(`${label}的代理商通路可得性已連續多週偏離自身基準，供應轉緊`);
    else if (state.pending) parts.push(`${label}的代理商通路本週首度偏離基準，尚待下週確認`);
    else if (String(state.trend ?? '').includes('loos')) parts.push(`${label}的代理商通路供應轉鬆`);
    else parts.push(`${label}的代理商通路供應平穩`);
    if (state.externalPrimary) parts.push('此類別以外部消息為主判定，通路樣本僅供參考');
  }
  if (eventText.includes('本站每週通路監測顯示')) parts.push(eventText.replace(/。$/, ''));
  return parts.length > 0 ? `${parts.join('；')}。` : eventText;
}

export type Divergence = 'news-ahead' | 'channel-ahead';

/** 新聞與通路指數是否打架：新聞喊缺但通路沒反映，或通路已轉緊但沒有新聞 */
export function detectDivergence(input: { supplySources: number; newsCount: number; state?: ChannelState | null }): Divergence | null {
  const { supplySources, newsCount, state } = input;
  if (!state || state.level === 'insufficient') return null;
  const tight = channelIsTight(state);
  // 記憶體等 externalPrimary 類別本來就以新聞為準，通路沒反映不算落差
  if (supplySources >= 2 && !tight && !state.pending && !state.externalPrimary) return 'news-ahead';
  if (tight && newsCount === 0) return 'channel-ahead';
  return null;
}

export function divergenceNote(kind: Divergence | null): string {
  if (kind === 'news-ahead') {
    return '本週有多家媒體報導此類別供應吃緊，但本站監測的授權代理商通路可得性尚未轉緊。報導中必須用一兩句明說這個落差：新聞喊缺、代理商通路還沒反映，兩者可能存在時間差，建議趁通路尚有貨時先確認需求；不可把通路寫成已經缺貨。';
  }
  if (kind === 'channel-ahead') {
    return '本站監測的授權代理商通路已連續轉緊，但本週沒有相關外電報導。報導中必須明說這是通路先行的早期訊號、市場消息尚未跟上；不可編造新聞事件。';
  }
  return '';
}

// ---- 審稿 ----

export interface ReviewSection {
  categoryId: string;
  categoryName: string;
  channelText: string;
  spotText?: string;
  evidence: string[];
  followUp?: string;
  divergenceNote?: string;
  newsWeight?: string;
}

export interface ReviewDraft {
  leadHeadline: string;
  lede: string;
  items: Array<{ categoryId: string; headline: string; story: string[]; watchpoint: string; action: string }>;
}

export interface EditorialVerdict {
  status: 'passed' | 'held';
  aiWritten: boolean;       // false＝AI 撰稿失敗，內容是本地範本稿
  aiReviewed: boolean;      // false＝審稿模型不可用，只跑了程式規則
  revised: boolean;         // 是否經過一次退稿重寫
  issues: string[];
}

const HOLLOW_PATTERNS = [
  /訊號升溫/, /值得留意/, /值得關注/, /壓力浮現/, /水溫上升/, /納入觀察/,
  /維持觀察/, /蠢蠢欲動/, /待觀察/, /宜先預備/,
];

export function isHollowHeadline(headline: string) {
  if (!headline || headline.length < 6 || headline.length > 40) return true;
  return HOLLOW_PATTERNS.some((pattern) => pattern.test(headline));
}

// 素材端寬鬆抽數字（型號裡的數字也算）；稿件端只抽「獨立的數字」——
// 黏著英文字母的（STM32H7P、DDR5、Q4、350MHz）是型號或代號，不是可查證的數據。
function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)));
}

function claimedNumbers(text: string): string[] {
  return (text.match(/(?<![A-Za-z0-9.])\d+(?:\.\d+)?(?![A-Za-z0-9])/g) ?? []).map((n) => String(Number(n)));
}

function externalMaterial(section: ReviewSection): string {
  return [...section.evidence, section.spotText ?? '', section.followUp ?? ''].join(' ');
}

/**
 * 程式規則審稿（不靠 AI，永遠會跑）：
 *  - 空洞標題（含本地範本句）
 *  - 素材有的類別，稿子漏寫
 *  - 標題與行動建議裡的數字必須出現在該篇的外部素材——通路觀測已不含數字，
 *    所以對不上的數字不是引用本站數據就是模型自己推算的。
 */
export function deterministicReview(draft: ReviewDraft, sections: ReviewSection[], marketContext = ''): string[] {
  const issues: string[] = [];
  if (isHollowHeadline(draft.leadHeadline)) issues.push(`整期頭條空洞或長度不合：「${draft.leadHeadline}」`);
  const allNumbers = new Set(numbersIn(`${sections.map(externalMaterial).join(' ')} ${marketContext}`));
  for (const n of claimedNumbers(draft.leadHeadline)) {
    if (!allNumbers.has(n)) issues.push(`整期頭條的數字 ${n} 不在外部素材中（疑似引用本站通路數據或自行推算）`);
  }
  for (const section of sections) {
    const item = draft.items.find((entry) => entry.categoryId === section.categoryId);
    if (!item) {
      issues.push(`${section.categoryName}：稿件缺少這一篇`);
      continue;
    }
    if (isHollowHeadline(item.headline)) issues.push(`${section.categoryName}：標題空洞或長度不合「${item.headline}」`);
    const allowed = new Set(numbersIn(externalMaterial(section)));
    for (const n of claimedNumbers(item.headline)) {
      if (!allowed.has(n)) issues.push(`${section.categoryName}：標題的數字 ${n} 不在外部素材中（疑似引用本站通路數據或自行推算）`);
    }
    for (const n of claimedNumbers(item.action)) {
      if (!allowed.has(n)) issues.push(`${section.categoryName}：行動建議的數字 ${n} 不在外部素材中（不可由通路觀測推導具體週數）`);
    }
  }
  return issues;
}

export function sectionMaterialText(section: ReviewSection, index: number): string {
  const evidence = section.evidence.length > 0
    ? section.evidence.map((line) => `  - ${line}`).join('\n')
    : '  （本週無外電新聞，以華強現貨熱搜為主線）';
  const weight = section.newsWeight ? `\n 新聞份量：${section.newsWeight}` : '';
  const spot = section.spotText ? `\n 華強現貨熱搜（可點名型號與人民幣參考價）：${section.spotText}` : '';
  const divergence = section.divergenceNote ? `\n 【落差】${section.divergenceNote}` : '';
  const followUp = section.followUp ? `\n 上期後續觀察：${section.followUp}` : '';
  return `[${index + 1}] categoryId=${section.categoryId}｜類別：${section.categoryName}${weight}\n 外部素材：\n${evidence}${spot}${divergence}${followUp}\n 本站通路觀測（僅供一句質性旁證）：${section.channelText || '（本週通路平穩）'}`;
}

// 審稿走 Flash 系列的獨立配額池，不跟撰稿模型搶每日額度
const GEMINI_REVIEW_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'];

/**
 * AI 審稿：把素材與稿件一起交給第二個模型逐句對照。回傳問題清單；
 * null＝審稿模型不可用（未設定 key、配額用盡、逾時），呼叫端只採程式規則的結果。
 */
export async function reviewWeeklyIssueWithGemini(
  draft: ReviewDraft,
  sections: ReviewSection[],
  marketContext = ''
): Promise<string[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const material = sections.map(sectionMaterialText).join('\n\n') + (marketContext ? `\n\n【市場大盤】${marketContext}` : '');
  const prompt = `你是電子供應鏈週刊的審稿編輯，負責在出刊前查證。下面是本期素材與記者寫好的稿件，請逐句對照素材找出問題。素材的排列順序就是編輯台排定的重要性順序，第 [1] 篇最重要。

【本期素材】
${material}

【稿件 JSON】
${JSON.stringify(draft)}

只檢查以下幾項，其餘（文筆、長度）不要管：
1. 稿件中的事實（公司、產品型號、價格、漲跌幅、交期、時間點、事件）是否都能在該篇素材中找到依據。素材沒有的說法算問題。
2. leadHeadline 是否取材自第 [1] 篇的主要事件。若頭條寫的是產品發表、規格升級這類非供應事件，而素材中有供應面事件，算問題。
3. headline、action 是否把「本站通路觀測」寫成具體數字（例如交期拉長幾週、提前幾週下單），或 headline 以通路觀測（代理商庫存、通路可得性）當主體。通路觀測只能在內文當一句質性旁證。
4. action 是否推薦導入或採購某個新產品。行動建議只能針對供應風險，不能替原廠推銷。
5. 素材標有【落差】的篇章，稿件是否有明說新聞與通路之間的落差；是否把通路沒反映寫成已經缺貨，或編造不存在的新聞。
6. 有「上期後續觀察」的篇章，若稿件宣稱了後續發展，該發展是否有本期素材支持。

只輸出 JSON，不要其他文字：{"issues":["類別名：具體問題（引用稿件原句）"]}
沒有問題就輸出 {"issues":[]}。寧可少報，不要把合理的改寫或摘要當成問題。`;

  for (const model of GEMINI_REVIEW_MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2048, temperature: 0.1, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) {
        console.warn(`[WeeklyReport Review] ${model} HTTP ${res.status}, trying next reviewer model.`);
        continue;
      }
      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
      const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text);
      if (!Array.isArray(parsed?.issues)) continue;
      return parsed.issues.map((issue: unknown) => String(issue).trim()).filter(Boolean).slice(0, 12);
    } catch (err) {
      console.warn(`[WeeklyReport Review] ${model} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return null;
}
