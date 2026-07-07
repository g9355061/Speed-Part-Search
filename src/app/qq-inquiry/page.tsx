'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx-js-style';
import { Header } from '@/components/Header';
import { Icon } from '@/components/Icon';

interface BomRow {
  mpn: string;
  qty: number;
  manufacturer?: string;
}

interface InquiryRow {
  rfqId: string;
  mpn: string;
  qty: number;
  manufacturer: string;
  supplier: string;
  stock: number;
  location: string;
  note: string;
  batch?: string;
  packageText?: string;
  date?: string;
  qq?: string;
  qqHref?: string;
  jumpUrl?: string | null;
}

interface HqewSearchResponse {
  partNumber: string;
  url: string;
  totalCount: number;
  queriedAt: string;
  suppliers: Array<{
    supplier: string;
    mpn: string;
    manufacturer: string;
    batch: string;
    stock: number;
    packageText: string;
    location: string;
    note: string;
    date: string;
    qq?: string;
    qqHref?: string;
    jumpUrl?: string | null;
  }>;
  error?: string;
}

interface QuoteRecord {
  id: string;
  rfqId?: string;
  mpn: string;
  qty: number;
  supplier: string;
  qq?: string;
  manufacturer: string;
  unitPrice: string;
  stock: string;
  moq: string;
  leadTime: string;
  rawReply: string;
  savedAt: string;
}

interface BomCase {
  id: string;
  fileName: string;
  createdAt: string;
  status: '詢價中' | '已結案';
  bomRows: BomRow[];
  quoteRecords: QuoteRecord[];
}

interface PendingDuplicateUpload {
  fileName: string;
  caseId: string;
  rows: BomRow[];
}

const CASE_STORAGE_KEY = 'speedpart.qqInquiry.cases.v1';
const ACTIVE_CASE_STORAGE_KEY = 'speedpart.qqInquiry.activeCaseId.v1';

const SAMPLE_ROWS: InquiryRow[] = [
  {
    rfqId: 'RFQ-DEMO-GCM155C71A105KE38D-01',
    mpn: 'GCM155C71A105KE38D',
    qty: 10000,
    manufacturer: 'MURATA/村田',
    supplier: '深圳市錦懋微電子有限公司',
    stock: 1630000,
    location: '深圳',
    note: '專營村田，請確認原裝、批號與含稅價',
    qq: '800875998',
  },
  {
    rfqId: 'RFQ-DEMO-GCM155C71A105KE38D-02',
    mpn: 'GCM155C71A105KE38D',
    qty: 10000,
    manufacturer: 'MURATA/村田',
    supplier: '深圳恒迪科技有限公司',
    stock: 20000,
    location: '深圳',
    note: '保證原裝和品質，請確認最快交期',
    qq: '3007316873',
  },
  {
    rfqId: 'RFQ-DEMO-GCM155C71A105KE38D-03',
    mpn: 'GCM155C71A105KE38D',
    qty: 10000,
    manufacturer: 'MURATA/村田',
    supplier: '深圳市金百珂實業有限公司',
    stock: 100000,
    location: '深圳',
    note: '更多數量請咨詢，請回覆 MOQ 與有效期',
    qq: '2881492917',
  },
];

function buildMessage(row: InquiryRow) {
  return [
    `詢價編號：${row.rfqId}`,
    '',
    '您好，麻煩幫忙報價，謝謝。',
    '',
    `料號：${row.mpn}`,
    `品牌：${row.manufacturer}`,
    `需求數量：${row.qty.toLocaleString()} pcs`,
    '需求：原裝正品，請提供含稅單價、庫存數量、MOQ/MPQ、批號、交期與報價有效期。',
    '',
    '如果有現貨，請一併提供可出貨時間與付款/物流條件。',
  ].join('\n');
}

function buildSampleReply(row: InquiryRow, idx: number) {
  const price = (0.108 + idx * 0.006).toFixed(3);
  const stock = Math.max(row.stock || 50000, 50000 + idx * 25000);
  const moq = idx === 0 ? 10000 : idx === 1 ? 5000 : 20000;
  const leadTime = idx === 0 ? '今天可發貨' : idx === 1 ? '明天可發貨' : '2 天內發貨';
  return [
    `詢價編號：${row.rfqId}`,
    `${row.supplier} 回覆：`,
    `單價：${price} 含稅，庫存 ${stock.toLocaleString()}，MOQ ${moq.toLocaleString()}，${leadTime}，報價有效期 3 天。`,
    `批號：${row.batch || '25+'}，原裝正品，可開票。`,
  ].join('\n');
}

function sanitizeRfqSegment(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28)
    .toUpperCase() || 'ITEM';
}

function makeRfqId(caseId: string | null, mpn: string, idx: number) {
  const caseSegment = sanitizeRfqSegment(caseId ?? 'BOM');
  const mpnSegment = sanitizeRfqSegment(mpn);
  return `RFQ-${caseSegment}-${mpnSegment}-${String(idx + 1).padStart(2, '0')}`;
}

function extractRfqId(text: string) {
  return text.match(/RFQ-[A-Z0-9][A-Z0-9-]*-[0-9]{2}/i)?.[0]?.toUpperCase() ?? null;
}

function parseReplyText(text: string) {
  // 標籤式（單價：0.112 含稅）與華強報價行式（DMP21D5UFB4-7B 2649pcs 0.2含税 DIODES(美台) 21+）都支援
  const price =
    text.match(/(?:單價|价格|價格|含稅|含税|RMB|￥|¥)\s*[:：]?\s*(?:RMB|￥|¥)?\s*([0-9]+(?:\.[0-9]+)?)/i)?.[1] ??
    text.match(/(?:^|[\s,，])([0-9]+(?:\.[0-9]+)?)\s*(?:元)?\s*含[税稅]/m)?.[1];
  const stock =
    text.match(/(?:庫存|库存|現貨|现货)\s*[:：]?\s*([0-9][0-9,]*)/i)?.[1] ??
    text.match(/([0-9][0-9,]*)\s*(?:pcs|pc)\b/i)?.[1];
  const leadTime =
    text.match(/(?:交期|發貨|发货)\s*[:：]?\s*([^\n，,。]+)/i)?.[1] ??
    text.match(/(今天可[發发]貨|明天可[發发]貨|現貨|现货|[0-9]+\s*天)/i)?.[1];
  const moq = text.match(/(?:MOQ|起訂|起订)\s*[:：]?\s*([0-9,]+)/i)?.[1];
  const batch =
    text.match(/批[号號]\s*[:：]?\s*([^\s，,。]+)/)?.[1] ??
    text.match(/(?:^|\s)([0-9]{2}\+)(?=\s|$)/m)?.[1];
  const validity = text.match(/有效期?\s*[:：]?\s*([0-9]+\s*[天日周週月])/)?.[1];
  const brand = text.match(/([A-Za-z][A-Za-z0-9]{1,15}\s*[（(][^（()）]{1,12}[)）])/)?.[1];
  const taxIncluded = /含[税稅]/.test(text);
  return {
    price: price ? `￥${price}${taxIncluded ? '（含稅）' : ''}` : '待確認',
    stock: stock ?? '待確認',
    leadTime: leadTime ?? '待確認',
    moq: moq ?? '待確認',
    batch: batch ?? '—',
    validity: validity ?? '—',
    brand: brand ?? '—',
  };
}

// 剔除廠商罐頭/促銷句（新客禮包、1片起售、自助服務…），保留任何帶報價訊號的片段。
// 以「句」為單位過濾（同一則訊息常混促銷與報價），寧可保守：有報價訊號的句子一律保留。
const PROMO_PATTERN = /[⭐🌟🎁💰🔥✨]|新客|注册|註冊|礼包|禮包|优惠|優惠|起售|了解我们|了解我們|了解更多|自助服务|自助服務|很高兴为您服务|请问有什么可以帮您|公众号|小程序|官网|實景|实景|VR|http|www\.|→|实名报价|請提供貴司|请提供贵司|电话联系|感谢理解|感謝理解|[0-9]️⃣/i;
const QUOTE_SIGNAL_PATTERN = /[0-9][0-9,]*\s*(?:pcs|pc)\b|[0-9](?:\.[0-9]+)?\s*(?:元)?\s*含[税稅]|含[税稅]\s*[:：]?\s*[0-9]|[￥¥]\s*[0-9]|(?:單價|价格|價格|庫存|库存|MOQ|起訂|起订|交期|批[号號]|有效期)\s*[:：]?\s*[0-9a-zA-Z]/i;

function cleanSupplierReply(text: string) {
  const segments = text.split(/(?<=[。！？!?；;\n])/);
  const kept: string[] = [];
  let dropped = 0;
  for (const seg of segments) {
    const s = seg.trim();
    if (!s) continue;
    if (PROMO_PATTERN.test(s) && !QUOTE_SIGNAL_PATTERN.test(s)) {
      dropped++;
      continue;
    }
    kept.push(s);
  }
  return { text: kept.join('\n'), dropped };
}

function parseQuantityValue(value: unknown): number {
  const raw = String(value ?? '').trim();
  const numeric = typeof value === 'number'
    ? value
    : Number(raw.replace(/,/g, '').replace(/^\((.*)\)$/, '-$1'));
  if (!Number.isFinite(numeric) || numeric === 0) return 1;
  return Math.max(1, Math.round(Math.abs(numeric)));
}

async function parseBomFile(file: File): Promise<BomRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const MPN_HEADER = /part|mpn|p\/n\b|\bpn\b|料號|料号|型號|型号/;
  let headerIdx = 0;
  for (let r = 0; r < Math.min(8, raw.length); r++) {
    if (raw[r].some((c) => MPN_HEADER.test(String(c).toLowerCase()))) {
      headerIdx = r;
      break;
    }
  }

  const headers = (raw[headerIdx] as string[]).map((h) => String(h).toLowerCase().trim());
  const mpnCol = headers.findIndex((h) => MPN_HEADER.test(h));
  const qtyCol = headers.findIndex((h) => /qty|quantity|數量|数量|pcs|demand|shortage|需求|缺料|短缺/.test(h));
  // 品牌欄要排除料號欄本身（「Manufacturer P/N」也含 manufacturer 字樣）
  const mfrCol = headers.findIndex(
    (h, i) => i !== mpnCol && /manufacturer|mfr|maker|brand|vendor|品牌|廠牌|厂牌|製造|制造|原廠|原厂/.test(h),
  );
  if (mpnCol === -1) throw new Error('找不到料號欄位：請使用 Part Number / MPN / P/N / 料號');

  const rows: BomRow[] = [];
  for (let r = headerIdx + 1; r < raw.length; r++) {
    const row = raw[r] as unknown[];
    const mpn = String(row[mpnCol] ?? '').trim();
    if (!mpn) continue;
    rows.push({
      mpn,
      qty: qtyCol !== -1 ? parseQuantityValue(row[qtyCol]) : 1,
      manufacturer: mfrCol !== -1 ? String(row[mfrCol] ?? '').trim() || undefined : undefined,
    });
  }
  return rows;
}

function quoteValueNumber(value: string): number | string {
  const n = Number(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && value !== '待確認' ? n : '';
}

function quoteValueNumeric(value: string): number | null {
  const n = Number(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && value !== '待確認' ? n : null;
}

function leadTimeScore(value: string) {
  if (/今天|現貨|现货/i.test(value)) return 0;
  if (/明天/i.test(value)) return 1;
  const days = value.match(/([0-9]+)\s*天/)?.[1];
  if (days) return Number(days);
  return 99;
}

function quoteScore(quote: QuoteRecord, demandQty: number) {
  const price = quoteValueNumeric(quote.unitPrice);
  const stock = quoteValueNumeric(quote.stock);
  const moq = quoteValueNumeric(quote.moq);
  const hasPrice = price !== null;
  const stockOk = stock !== null && stock >= demandQty;
  const moqOk = moq === null || moq <= demandQty;
  return [
    hasPrice ? 0 : 1,
    stockOk ? 0 : 1,
    moqOk ? 0 : 1,
    price ?? Number.MAX_SAFE_INTEGER,
    leadTimeScore(quote.leadTime),
    -(stock ?? 0),
  ];
}

function compareQuote(a: QuoteRecord, b: QuoteRecord, demandQty: number) {
  const scoreA = quoteScore(a, demandQty);
  const scoreB = quoteScore(b, demandQty);
  for (let i = 0; i < scoreA.length; i++) {
    if (scoreA[i] !== scoreB[i]) return scoreA[i] - scoreB[i];
  }
  return 0;
}

function pickBestQuote(quotes: QuoteRecord[], demandQty: number) {
  return [...quotes].sort((a, b) => compareQuote(a, b, demandQty))[0] ?? null;
}

function bestQuoteReason(quote: QuoteRecord | null, candidateCount: number, demandQty: number) {
  if (!quote) return '';
  const stock = quoteValueNumeric(quote.stock);
  const moq = quoteValueNumeric(quote.moq);
  const checks = [
    quoteValueNumeric(quote.unitPrice) !== null ? '有單價' : '單價待確認',
    stock !== null && stock >= demandQty ? '庫存足夠' : '庫存需確認',
    moq === null || moq <= demandQty ? 'MOQ符合' : 'MOQ高於需求',
  ];
  return `自動從 ${candidateCount} 筆報價挑選：${checks.join('、')}`;
}

function formatCaseDate(date = new Date()) {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function makeCaseId(existingCases: BomCase[]) {
  const base = `BOM-${formatCaseDate()}`;
  const used = new Set(existingCases.map((item) => item.id));
  for (let idx = 1; idx <= 99; idx++) {
    const candidate = `${base}-${String(idx).padStart(2, '0')}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString().slice(-4)}`;
}

function hqewSearchUrl(mpn: string) {
  return `https://s.hqew.com/${encodeURIComponent(mpn)}.html`;
}

function isQidianHref(href?: string) {
  return !!href && /qidian=true|wpa1\.qq\.com/i.test(href);
}

// QQ NT 只放行「騰訊簽章過」的深層連結（tencent://QQInterLive?...&kfuin=...&uid=...），
// 裸號 tencent://message 一律被風險視窗擋下。簽章連結用隱藏 iframe 觸發即可喚起 QQ。
function launchQqDeepLink(url: string, ttl = 2000) {
  const launcher = document.createElement('iframe');
  launcher.style.display = 'none';
  launcher.src = url;
  document.body.appendChild(launcher);
  window.setTimeout(() => launcher.remove(), ttl);
}

// 只走 Hammerspoon 的本機 HTTP 端點觸發「切到 QQ + Cmd+V」。
// 不再同時發 hammerspoon:// URL scheme：雙路會連按多次 Cmd+V 造成重複貼上，
// 且瀏覽器每次都跳「要開啟 Hammerspoon？」確認框。
function triggerLocalQqPasteHelper() {
  const img = new Image();
  img.src = `http://127.0.0.1:5298/paste?delay=2600&ts=${Date.now()}`;
}

// 貼進 Hammerspoon Console 的一行安裝指令（免 Terminal、免 Gatekeeper 放行）。
// helper 程式檔「整份內嵌」在指令裡，貼上時純寫檔、不需連網——
// 大陸辦公室瀏覽器走代理但 curl 直連被擋的情境也能安裝。
async function buildConsoleInstallCommand(): Promise<string | null> {
  try {
    const res = await fetch('/qq-paste/speedpart-qq-paste.lua', { cache: 'no-store' });
    if (!res.ok) return null;
    const lua = await res.text();
    if (!lua.includes('speedpartQqPasteServer')) return null;
    // Console 輸入列是單行欄位：內容逸出成單行 lua 字串再寫檔
    const escaped = lua
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r/g, '')
      .replace(/\n/g, '\\n');
    return (
      'local home=os.getenv("HOME") ' +
      'os.execute(\'mkdir -p "\'..home..\'/.hammerspoon"\') ' +
      'local f=io.open(home.."/.hammerspoon/speedpart-qq-paste.lua","w") ' +
      'f:write("' + escaped + '") f:close() ' +
      'local r=io.open(home.."/.hammerspoon/init.lua","r") local cur=r and r:read("*a") or "" if r then r:close() end ' +
      'if not cur:find("speedpart-qq-paste",1,true) then local a=io.open(home.."/.hammerspoon/init.lua","a") a:write(\'\\nrequire("speedpart-qq-paste")\\n\') a:close() end ' +
      'hs.reload()'
    );
  } catch {
    return null;
  }
}

// 偵測本機 Hammerspoon 自動貼上助手是否在線（lua 端已設 CORS 與
// Access-Control-Allow-Private-Network，https 頁面對 127.0.0.1 的請求瀏覽器放行）
async function detectPasteHelper(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:5298/health?ts=${Date.now()}`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

interface QqChatCapture {
  partner: string;
  partnerQq: string;
  rfqId: string | null;
  rfqCount: number;
  supplierText: string;
  warning: string | null;
}

// 透過 Hammerspoon 讀取 QQ 目前對話的文字。
// QQ NT（Electron）的輔助功能樹在第一次請求時才開始建構，讀到太少就稍候重讀一次。
async function fetchQqChatTexts(): Promise<string[] | null> {
  const read = async () => {
    const res = await fetch(`http://127.0.0.1:5298/read-chat?ts=${Date.now()}`, {
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; texts?: string[] };
    return data.ok ? data.texts ?? [] : null;
  };
  let texts = await read().catch(() => null);
  if (texts && texts.length < 20) {
    await new Promise((r) => setTimeout(r, 900));
    texts = await read().catch(() => null);
  }
  return texts;
}

function rfqMpnSegment(rfqId: string) {
  return rfqId.match(/^RFQ-BOM-\d{8}-\d{2}-(.+)-\d{2,}$/i)?.[1]?.toUpperCase() ?? null;
}

function rfqSupplierIndex(rfqId: string) {
  const n = Number(rfqId.match(/-(\d{2,})$/)?.[1]);
  return Number.isFinite(n) && n >= 1 ? n - 1 : null;
}

// 從 AX 文字流抽出「目前對話」的廠商回覆與 RFQ 錨點。
// 版面結構（實測 QQ NT 6.9.96）：左側會話清單 →「消息列表」→ 訊息區
// （時間 / 發話者暱稱 / 內容 交錯）→「会话」工具列 → 右側資料卡（昵称/QQ号...）。
function extractQqReply(texts: string[]): QqChatCapture | null {
  const start = texts.indexOf('消息列表');
  if (start === -1) return null;
  let end = texts.length;
  for (let i = start + 1; i < texts.length; i++) {
    if (texts[i] === '会话' || texts[i] === '表情') { end = i; break; }
  }
  const msgs: string[] = [];
  for (let i = start + 1; i < end; i++) {
    const t = texts[i].trim();
    if (!t || t === msgs[msgs.length - 1]) continue; // 虛擬列表殘影去重
    msgs.push(t);
  }

  // 對話身分：標題「<暱稱> 临时会话」＋右側資料卡「QQ号 <號碼>」
  const partnerIdx = texts.indexOf('临时会话');
  const partner = partnerIdx > 0 ? texts[partnerIdx - 1].trim() : '';
  const qqIdx = texts.indexOf('QQ号');
  const partnerQq = qqIdx !== -1 ? (texts[qqIdx + 1] ?? '').replace(/\D/g, '') : '';

  // 我方詢價訊息 → RFQ 錨點
  const rfqMarks: Array<{ idx: number; id: string }> = [];
  msgs.forEach((m, idx) => {
    const id = m.match(/詢價編號[:：]\s*(RFQ-[A-Z0-9-]+)/i)?.[1];
    if (id) rfqMarks.push({ idx, id: id.toUpperCase() });
  });

  // 廠商訊息＝緊接在「廠商暱稱」後面的內容（排除我方詢價本文與暱稱本身）
  const supplierMsgs: Array<{ idx: number; text: string }> = [];
  for (let i = 0; i < msgs.length - 1; i++) {
    if (!partner || msgs[i] !== partner) continue;
    const body = msgs[i + 1];
    if (!body || body === partner || /詢價編號[:：]/.test(body)) continue;
    if (!supplierMsgs.some((s) => s.text === body)) supplierMsgs.push({ idx: i + 1, text: body });
  }

  // 歸屬：料號優先（廠商回覆含某 RFQ 的料號），否則取對話中最後一筆 RFQ
  let chosen = rfqMarks[rfqMarks.length - 1] ?? null;
  if (rfqMarks.length > 1) {
    outer: for (let i = supplierMsgs.length - 1; i >= 0; i--) {
      const body = supplierMsgs[i].text.toUpperCase();
      for (let j = rfqMarks.length - 1; j >= 0; j--) {
        const mpn = rfqMpnSegment(rfqMarks[j].id);
        if (mpn && body.includes(mpn)) { chosen = rfqMarks[j]; break outer; }
      }
    }
  }

  let picked = chosen ? supplierMsgs.filter((s) => s.idx > chosen!.idx) : supplierMsgs;
  let warning: string | null = null;
  if (!picked.length && supplierMsgs.length) {
    picked = supplierMsgs.slice(-3);
    warning = '廠商訊息出現在詢價之前，請確認歸屬的 RFQ 是否正確';
  }
  if (rfqMarks.length > 1) {
    warning = warning ?? `此對話含 ${rfqMarks.length} 筆詢價，已歸屬 ${chosen?.id ?? '最後一筆'}，請確認`;
  }
  if (!chosen && !picked.length) return null;

  return {
    partner,
    partnerQq,
    rfqId: chosen?.id ?? null,
    rfqCount: rfqMarks.length,
    supplierText: picked.map((s) => s.text).join('\n'),
    warning,
  };
}

export default function QqInquiryPage() {
  const [selected, setSelected] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copiedInquiryQq, setCopiedInquiryQq] = useState<string | null>(null);
  const [qqOpenOutcome, setQqOpenOutcome] = useState<'opening' | 'manual'>('opening');
  const [pasteHelperOnline, setPasteHelperOnline] = useState<boolean | null>(null);
  const [copiedInstallCmd, setCopiedInstallCmd] = useState(false);
  const [qqReading, setQqReading] = useState(false);
  const [qqCaptureNote, setQqCaptureNote] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const [reply, setReply] = useState('單價：0.112 含稅，庫存 100000，MOQ 10000，今天可發貨，報價有效期 3 天。');
  const [bomRows, setBomRows] = useState<BomRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [hqewResult, setHqewResult] = useState<HqewSearchResponse | null>(null);
  const [hqewResultsByMpn, setHqewResultsByMpn] = useState<Record<string, HqewSearchResponse>>({});
  const [hqewLoading, setHqewLoading] = useState(false);
  const [hqewError, setHqewError] = useState<string | null>(null);
  const [quoteRecords, setQuoteRecords] = useState<QuoteRecord[]>([]);
  const [cases, setCases] = useState<BomCase[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [pendingDuplicate, setPendingDuplicate] = useState<PendingDuplicateUpload | null>(null);
  const [savedQuoteId, setSavedQuoteId] = useState<string | null>(null);
  const [copiedSampleIdx, setCopiedSampleIdx] = useState<number | null>(null);
  const [bomIndex, setBomIndex] = useState(0);
  const [queriedMpns, setQueriedMpns] = useState<string[]>([]);

  const activeCase = cases.find((item) => item.id === activeCaseId) ?? null;
  const activeBom = bomRows[bomIndex] ?? bomRows[0];
  const hasPrevBom = bomIndex > 0;
  const hasNextBom = bomIndex < bomRows.length - 1;
  const hqewRows: InquiryRow[] = useMemo(() => {
    if (!hqewResult?.suppliers?.length) {
      if (!activeBom) return SAMPLE_ROWS;
      return [{
        rfqId: makeRfqId(activeCaseId, activeBom.mpn, 0),
        mpn: activeBom.mpn,
        qty: activeBom.qty,
        manufacturer: '待華強查詢',
        supplier: '請先查詢華強電子網',
        stock: 0,
        location: '-',
        note: '查詢華強後會帶入推薦供應商與聯絡方式',
      }];
    }
    return hqewResult.suppliers.map((s, idx) => ({
      rfqId: makeRfqId(activeCaseId, activeBom?.mpn ?? s.mpn, idx),
      mpn: activeBom?.mpn ?? s.mpn,
      qty: activeBom?.qty ?? 1,
      manufacturer: s.manufacturer,
      supplier: s.supplier,
      stock: s.stock,
      location: s.location,
      note: s.note || '請確認原裝、含稅價、MOQ、批號與交期',
      batch: s.batch,
      packageText: s.packageText,
      date: s.date,
      qq: s.qq,
      qqHref: s.qqHref,
      jumpUrl: s.jumpUrl,
    }));
  }, [activeBom, activeCaseId, hqewResult]);

  const current = hqewRows[selected] ?? hqewRows[0];
  const message = useMemo(() => buildMessage(current), [current]);
  const sampleReplies = useMemo(() => hqewRows.map((row, idx) => buildSampleReply(row, idx)), [hqewRows]);
  const parsed = useMemo(() => parseReplyText(reply), [reply]);
  const detectedRfqId = useMemo(() => extractRfqId(reply), [reply]);
  const detectedRow = useMemo(
    () => hqewRows.find((row) => row.rfqId.toUpperCase() === detectedRfqId),
    [detectedRfqId, hqewRows],
  );
  const quoteTarget = detectedRow ?? current;
  const quotedMpns = useMemo(() => new Set(quoteRecords.map((record) => record.mpn)), [quoteRecords]);
  const visibleQueriedMpns = useMemo(() => {
    const next = new Set(queriedMpns);
    if (hqewResult?.partNumber) next.add(hqewResult.partNumber);
    for (const mpn of quotedMpns) next.add(mpn);
    return next;
  }, [hqewResult?.partNumber, queriedMpns, quotedMpns]);

  useEffect(() => {
    void detectPasteHelper().then(setPasteHelperOnline);
  }, []);

  useEffect(() => {
    try {
      const rawCases = localStorage.getItem(CASE_STORAGE_KEY);
      const loadedCases: BomCase[] = rawCases ? JSON.parse(rawCases) : [];
      const storedActiveId = localStorage.getItem(ACTIVE_CASE_STORAGE_KEY);
      if (loadedCases.length) {
        const nextActive = loadedCases.find((item) => item.id === storedActiveId) ?? loadedCases[0];
        setCases(loadedCases);
        setActiveCaseId(nextActive.id);
        setBomRows(nextActive.bomRows);
        setQuoteRecords(nextActive.quoteRecords);
      }
    } catch {
      localStorage.removeItem(CASE_STORAGE_KEY);
      localStorage.removeItem(ACTIVE_CASE_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(CASE_STORAGE_KEY, JSON.stringify(cases));
  }, [cases]);

  useEffect(() => {
    if (activeCaseId) localStorage.setItem(ACTIVE_CASE_STORAGE_KEY, activeCaseId);
  }, [activeCaseId]);

  function syncActiveCase(update: Partial<Pick<BomCase, 'bomRows' | 'quoteRecords' | 'status'>>) {
    if (!activeCaseId) return;
    setCases((prev) => prev.map((item) => item.id === activeCaseId ? { ...item, ...update } : item));
  }

  function switchCase(caseId: string) {
    const nextCase = cases.find((item) => item.id === caseId);
    if (!nextCase) return;
    setActiveCaseId(caseId);
    setBomRows(nextCase.bomRows);
    setQuoteRecords(nextCase.quoteRecords);
    setHqewResult(null);
    setHqewResultsByMpn({});
    setHqewError(null);
    setSelected(0);
    setBomIndex(0);
    setQueriedMpns([]);
  }

  function deleteCase(caseId: string) {
    const targetCase = cases.find((item) => item.id === caseId);
    if (!targetCase) return;
    const confirmed = window.confirm(`確定要刪除 ${targetCase.id}？\nBOM 檔案：${targetCase.fileName}\n此 Case 的報價紀錄也會一起移除。`);
    if (!confirmed) return;

    const remainingCases = cases.filter((item) => item.id !== caseId);
    setCases(remainingCases);
    if (activeCaseId !== caseId) return;

    const nextCase = remainingCases[0] ?? null;
    if (nextCase) {
      setActiveCaseId(nextCase.id);
      setBomRows(nextCase.bomRows);
      setQuoteRecords(nextCase.quoteRecords);
    } else {
      setActiveCaseId(null);
      setBomRows([]);
      setQuoteRecords([]);
    }
    setHqewResult(null);
    setHqewResultsByMpn({});
    setHqewError(null);
    setSelected(0);
    setBomIndex(0);
    setQueriedMpns([]);
  }

  async function copyMessage() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function copyAndOpenHqew() {
    await copyMessage();
    const mpn = activeBom?.mpn ?? current.mpn;
    window.open(hqewSearchUrl(mpn), '_blank', 'noopener,noreferrer');
  }

  async function copySampleReply(text: string, idx: number) {
    await navigator.clipboard.writeText(text);
    setCopiedSampleIdx(idx);
    window.setTimeout(() => setCopiedSampleIdx(null), 1600);
  }

  async function openSupplierQq(row: InquiryRow) {
    // 一律先複製完整詢價內容到剪貼簿（最有價值、且不會出錯的部分）
    void navigator.clipboard.writeText(buildMessage(row)).catch(() => undefined);
    setCopiedInquiryQq(row.rfqId);
    setQqOpenOutcome('opening');
    window.setTimeout(() => setCopiedInquiryQq(null), 4000);

    // 搜尋階段已預抓的簽章深層連結（tencent://QQInterLive）：QQ 直接切到
    // 「正確供應商」的臨時會話，此時才觸發 Hammerspoon 自動貼上。
    // 在點擊手勢內同步喚起，不經 async 請求，避免瀏覽器擋自訂協議。
    if (row.jumpUrl) {
      if (row.jumpUrl.startsWith('tencent://')) {
        launchQqDeepLink(row.jumpUrl);
      } else {
        window.open(row.jumpUrl, '_blank');
      }
      triggerLocalQqPasteHelper();
      return;
    }

    // 華強已給企點簽章連結：開官方頁由騰訊喚起 QQ。
    if (isQidianHref(row.qqHref)) {
      window.open(row.qqHref!, '_blank');
      triggerLocalQqPasteHelper();
      return;
    }

    // 未開通臨時會話（個人 QQ）：提示手動加好友，
    // 絕不觸發自動貼上（QQ 不會切換對話，會貼進錯誤對話）。
    setQqOpenOutcome('manual');
  }

  // 導讀式收割：讀取 QQ 目前開啟的對話 → 抽出廠商回覆與 RFQ 錨點 →
  // 帶入回覆解析區（原文可修、解析結果並列），確認後才由「加入報價紀錄」寫入。
  async function readReplyFromQq() {
    setQqReading(true);
    setQqCaptureNote(null);
    try {
      const texts = await fetchQqChatTexts();
      if (!texts) {
        setQqCaptureNote({ kind: 'error', text: '連不到自動貼上助手（Hammerspoon）——請先依上方指引安裝，或確認它在執行中' });
        return;
      }
      const cap = extractQqReply(texts);
      if (!cap) {
        setQqCaptureNote({ kind: 'error', text: '讀不到對話內容：請先在 QQ 點開該廠商的對話視窗再按一次' });
        return;
      }
      if (!cap.supplierText) {
        setQqCaptureNote({ kind: 'warn', text: `已讀取「${cap.partner || '對話'}」，但目前還沒有廠商回覆訊息` });
        return;
      }

      // 依 RFQ 自動切到對應料號，讓來源列正確配對到該供應商
      if (cap.rfqId) {
        const mpnSeg = rfqMpnSegment(cap.rfqId);
        const idx = mpnSeg ? bomRows.findIndex((r) => sanitizeRfqSegment(r.mpn) === mpnSeg) : -1;
        if (idx !== -1 && idx !== bomIndex) selectBomIndex(idx);
      }
      const cleaned = cleanSupplierReply(cap.supplierText);
      const bodyText = cleaned.text || cap.supplierText;
      setReply(cap.rfqId ? `詢價編號：${cap.rfqId}\n${bodyText}` : bodyText);

      // 身分核對：對話右側資料卡的 QQ 號 vs 該 RFQ 當初寄給的供應商 QQ
      const parts: string[] = [`已讀取「${cap.partner}」${cap.partnerQq ? `（QQ ${cap.partnerQq}）` : ''}`];
      let kind: 'ok' | 'warn' = 'ok';
      if (cap.rfqId) {
        parts.push(`自動配對 ${cap.rfqId}`);
        const mpnSeg = rfqMpnSegment(cap.rfqId);
        const supIdx = rfqSupplierIndex(cap.rfqId);
        const bomMpn = mpnSeg ? bomRows.find((r) => sanitizeRfqSegment(r.mpn) === mpnSeg)?.mpn : undefined;
        const expected = bomMpn && supIdx !== null ? hqewResultsByMpn[bomMpn]?.suppliers?.[supIdx] : undefined;
        if (expected?.qq && cap.partnerQq) {
          if (expected.qq.replace(/\D/g, '') === cap.partnerQq) {
            parts.push('✓ QQ 號與該 RFQ 供應商相符');
          } else {
            kind = 'warn';
            parts.push(`⚠ 對話 QQ（${cap.partnerQq}）與 RFQ 供應商 QQ（${expected.qq}）不符，請人工確認來源`);
          }
        }
      } else {
        kind = 'warn';
        parts.push('⚠ 對話中找不到我們送出的詢價編號，請手動選擇回覆來源');
      }
      if (cleaned.dropped > 0) {
        parts.push(`已剔除 ${cleaned.dropped} 句促銷/罐頭訊息`);
      }
      if (cap.warning) {
        kind = 'warn';
        parts.push(`⚠ ${cap.warning}`);
      }
      setQqCaptureNote({ kind, text: parts.join('；') });
    } finally {
      setQqReading(false);
    }
  }

  async function handleBomUpload(file: File) {
    setParseError(null);
    setHqewError(null);
    setHqewResult(null);
    setHqewResultsByMpn({});
    setSelected(0);
    setBomIndex(0);
    setQueriedMpns([]);
    setPendingDuplicate(null);
    try {
      const rows = await parseBomFile(file);
      if (!rows.length) {
        setParseError('BOM 裡沒有有效料號');
        setBomRows([]);
        return;
      }
      const duplicateCase = cases.find((item) => item.fileName === file.name);
      if (duplicateCase) {
        setPendingDuplicate({ fileName: file.name, caseId: duplicateCase.id, rows });
        return;
      }
      const nextCase: BomCase = {
        id: makeCaseId(cases),
        fileName: file.name,
        createdAt: new Date().toLocaleString('zh-TW', { hour12: false }),
        status: '詢價中',
        bomRows: rows,
        quoteRecords: [],
      };
      setCases((prev) => [nextCase, ...prev]);
      setActiveCaseId(nextCase.id);
      setBomRows(rows);
      setQuoteRecords([]);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
      setBomRows([]);
    }
  }

  function replaceDuplicateCase() {
    if (!pendingDuplicate) return;
    const nextCase: BomCase = {
      id: pendingDuplicate.caseId,
      fileName: pendingDuplicate.fileName,
      createdAt: new Date().toLocaleString('zh-TW', { hour12: false }),
      status: '詢價中',
      bomRows: pendingDuplicate.rows,
      quoteRecords: [],
    };
    setCases((prev) => [nextCase, ...prev.filter((item) => item.id !== pendingDuplicate.caseId)]);
    setActiveCaseId(nextCase.id);
    setBomRows(nextCase.bomRows);
    setQuoteRecords([]);
    setHqewResult(null);
    setHqewResultsByMpn({});
    setHqewError(null);
    setSelected(0);
    setBomIndex(0);
    setQueriedMpns([]);
    setPendingDuplicate(null);
  }

  function continueExistingCase() {
    if (!pendingDuplicate) return;
    switchCase(pendingDuplicate.caseId);
    setPendingDuplicate(null);
  }

  function selectBomIndex(nextIndex: number) {
    if (!bomRows.length) return;
    const safeIndex = Math.min(Math.max(nextIndex, 0), bomRows.length - 1);
    const nextMpn = bomRows[safeIndex]?.mpn;
    setBomIndex(safeIndex);
    setHqewResult(nextMpn ? hqewResultsByMpn[nextMpn] ?? null : null);
    setHqewError(null);
    setSelected(0);
  }

  async function searchActiveBomOnHqew() {
    if (!activeBom || hqewLoading) return;
    setHqewLoading(true);
    setHqewError(null);
    setHqewResult(null);
    setSelected(0);
    try {
      const params = new URLSearchParams({ partNumber: activeBom.mpn });
      const resp = await fetch(`/api/hqew/search?${params.toString()}`, { cache: 'no-store' });
      const json: HqewSearchResponse = await resp.json();
      if (!resp.ok) throw new Error(json.error || `HTTP ${resp.status}`);
      setHqewResult(json);
      setHqewResultsByMpn((prev) => ({ ...prev, [activeBom.mpn]: json }));
      setQueriedMpns((prev) => prev.includes(activeBom.mpn) ? prev : [...prev, activeBom.mpn]);
    } catch (e) {
      setHqewError(e instanceof Error ? e.message : String(e));
    } finally {
      setHqewLoading(false);
    }
  }

  function addQuoteRecord() {
    const target = quoteTarget;
    const record: QuoteRecord = {
      id: `${target.rfqId}-${Date.now()}`,
      rfqId: target.rfqId,
      mpn: target.mpn,
      qty: target.qty,
      supplier: target.supplier,
      qq: target.qq,
      manufacturer: target.manufacturer,
      unitPrice: parsed.price,
      stock: parsed.stock,
      moq: parsed.moq,
      leadTime: parsed.leadTime,
      rawReply: reply,
      savedAt: new Date().toLocaleString('zh-TW', { hour12: false }),
    };
    const nextRecords = [
      record,
      ...quoteRecords.filter((r) => {
        if (r.rfqId && record.rfqId) return r.rfqId !== record.rfqId;
        return !(r.mpn === record.mpn && r.supplier === record.supplier);
      }),
    ];
    setQuoteRecords(nextRecords);
    syncActiveCase({ quoteRecords: nextRecords });
    setSavedQuoteId(record.rfqId ?? record.id);
    window.setTimeout(() => setSavedQuoteId(null), 1800);
  }

  function exportBomWithQuotes() {
    const quotesByMpn = new Map<string, QuoteRecord[]>();
    for (const quote of quoteRecords) {
      const existing = quotesByMpn.get(quote.mpn) ?? [];
      quotesByMpn.set(quote.mpn, [...existing, quote]);
    }

    const sourceRows = bomRows.length ? bomRows : [{ mpn: current.mpn, qty: current.qty }];
    const bomSheetRows = [
      ['Part Number (MPN)', 'Quantity', '候選報價數', '最佳RFQ ID', '推薦供應商', 'QQ', '品牌', '含稅單價(RMB)', '可供庫存', 'MOQ', '交期', '挑選原因', '回覆時間', 'QQ原始回覆'],
      ...sourceRows.map((row) => {
        const quotes = quotesByMpn.get(row.mpn) ?? [];
        const quote = pickBestQuote(quotes, row.qty);
        return [
          row.mpn,
          row.qty,
          quotes.length,
          quote?.rfqId ?? '',
          quote?.supplier ?? '',
          quote?.qq ?? '',
          quote?.manufacturer ?? '',
          quote ? quoteValueNumber(quote.unitPrice) : '',
          quote ? quoteValueNumber(quote.stock) : '',
          quote ? quoteValueNumber(quote.moq) : '',
          quote?.leadTime === '待確認' ? '' : quote?.leadTime ?? '',
          bestQuoteReason(quote, quotes.length, row.qty),
          quote?.savedAt ?? '',
          quote?.rawReply ?? '',
        ];
      }),
    ];

    const quoteSheetRows = [
      ['RFQ ID', '料號', '需求數量', '供應商', 'QQ', '品牌', '含稅單價(RMB)', '可供庫存', 'MOQ', '交期', '回覆時間', 'QQ原始回覆'],
      ...quoteRecords.map((quote) => [
        quote.rfqId ?? '',
        quote.mpn,
        quote.qty,
        quote.supplier,
        quote.qq ?? '',
        quote.manufacturer,
        quoteValueNumber(quote.unitPrice),
        quoteValueNumber(quote.stock),
        quoteValueNumber(quote.moq),
        quote.leadTime === '待確認' ? '' : quote.leadTime,
        quote.savedAt,
        quote.rawReply,
      ]),
    ];

    const wb = XLSX.utils.book_new();
    const bomWs = XLSX.utils.aoa_to_sheet(bomSheetRows);
    bomWs['!cols'] = [22, 12, 12, 34, 30, 16, 18, 16, 14, 12, 14, 36, 20, 48].map((wch) => ({ wch }));
    const quoteWs = XLSX.utils.aoa_to_sheet(quoteSheetRows);
    quoteWs['!cols'] = [34, 22, 12, 30, 16, 18, 16, 14, 12, 14, 20, 48].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, bomWs, 'BOM 回填');
    XLSX.utils.book_append_sheet(wb, quoteWs, '報價紀錄');
    XLSX.writeFile(wb, `SpeedPart_${activeCase?.id ?? 'QQ_Quote'}_Backfill.xlsx`);
  }

  return (
    <div className="app">
      <Header />
      <main className="qq-main">
        <section className="qq-titlebar">
          <div>
            <h1>QQ詢價工作台</h1>
            <p>BOM 匯入後，自動整理華強電子網候選供應商；採購確認內容後，再用 QQ / 微信 / Email 半自動詢價。</p>
          </div>
          <button className="btn-primary" onClick={copyMessage}>
            <Icon name={copied ? 'check' : 'copy'} size={14} />
            {copied ? '已複製' : '複製詢價文字'}
          </button>
        </section>

        <section className="qq-flow">
          {['BOM匯入', '華強電子網', '推薦前3家', '人工確認', 'QQ/微信/Email', '回覆解析', 'Excel回填'].map((step, idx) => (
            <div key={step} className={'qq-flow-step' + (idx <= 3 ? ' active' : '')}>
              <span>{idx + 1}</span>
              {step}
            </div>
          ))}
        </section>

        <section className="qq-bom-card card">
          <div className="card-hd">
            <h3><Icon name="file" size={14} />BOM 上傳與料號華強查詢</h3>
            <span className="sub">可切換 BOM 料號逐筆查詢，查過的料號會標記狀態</span>
          </div>
          <div className="card-bd">
            <div className="qq-case-strip">
              <div>
                <span>BOM 檔案</span>
                <strong>{activeCase?.fileName ?? '-'}</strong>
              </div>
              <div>
                <span>狀態</span>
                <strong>{activeCase?.status ?? '-'}</strong>
              </div>
              <div>
                <span>本 Case 報價</span>
                <strong>{quoteRecords.length.toLocaleString()}</strong>
              </div>
            </div>
            {cases.length > 0 && (
              <div className="qq-case-switch">
                <span>切換 Case</span>
                {cases.map((item) => (
                  <div key={item.id} className={'qq-case-chip' + (item.id === activeCaseId ? ' active' : '')}>
                    <button type="button" className="qq-case-select" onClick={() => switchCase(item.id)}>
                      {item.id}
                    </button>
                    <button
                      type="button"
                      className="qq-case-delete"
                      aria-label={`刪除 ${item.id}`}
                      title={`刪除 ${item.id}`}
                      onClick={() => deleteCase(item.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="qq-bom-actions">
              <label className="btn-primary qq-upload-label" htmlFor="qq-bom-file-input">
                <Icon name="file" size={14} />上傳 BOM Excel / CSV
              </label>
              <button className="btn" onClick={() => selectBomIndex(bomIndex - 1)} disabled={!hasPrevBom || hqewLoading}>
                上一筆
              </button>
              <button className="btn" onClick={() => selectBomIndex(bomIndex + 1)} disabled={!hasNextBom || hqewLoading}>
                下一筆
              </button>
              <button className="btn solid" onClick={searchActiveBomOnHqew} disabled={!activeBom || hqewLoading}>
                <Icon name="search" size={13} />{hqewLoading ? '查詢華強中...' : `查詢第 ${bomRows.length ? bomIndex + 1 : '-'} 筆`}
              </button>
              {activeBom && (
                <a className="btn" href={hqewSearchUrl(activeBom.mpn)} target="_blank" rel="noreferrer">
                  <Icon name="external" size={13} />打開華強頁面
                </a>
              )}
              <input
                id="qq-bom-file-input"
                className="qq-file-input"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleBomUpload(file);
                  e.target.value = '';
                }}
              />
            </div>

            <div className="qq-bom-status">
              <div>
                <span>BOM 筆數</span>
                <strong>{bomRows.length ? bomRows.length.toLocaleString() : '-'}</strong>
              </div>
              <div>
                <span>目前料號</span>
                <strong className="mono">{activeBom ? `${bomIndex + 1}. ${activeBom.mpn}` : '-'}</strong>
              </div>
              <div>
                <span>品牌 Manufacturer</span>
                <strong>{activeBom?.manufacturer || '-'}</strong>
              </div>
              <div>
                <span>需求數量</span>
                <strong className="mono">{activeBom ? activeBom.qty.toLocaleString() : '-'}</strong>
              </div>
              <div>
                <span>查詢進度</span>
                <strong>{bomRows.length ? `${visibleQueriedMpns.size}/${bomRows.length} 已查` : '-'}</strong>
              </div>
            </div>

            {bomRows.length > 0 && (
              <div className="qq-bom-picker">
                {bomRows.map((row, idx) => {
                  const quoted = quotedMpns.has(row.mpn);
                  const queried = visibleQueriedMpns.has(row.mpn);
                  return (
                    <button
                      key={`${row.mpn}-${idx}`}
                      className={(idx === bomIndex ? 'active ' : '') + (quoted ? 'quoted' : queried ? 'queried' : '')}
                      onClick={() => selectBomIndex(idx)}
                      title={quoted ? '已有報價紀錄' : queried ? '已查詢華強' : '尚未查詢'}
                    >
                      <span>{idx + 1}</span>
                      <strong>{row.mpn}</strong>
                      <em>{quoted ? '已報價' : queried ? '已查' : '未查'}</em>
                    </button>
                  );
                })}
              </div>
            )}

            {parseError && <div className="qq-inline-error">{parseError}</div>}
            {hqewError && <div className="qq-inline-error">華強查詢失敗：{hqewError}</div>}
            {pendingDuplicate && (
              <div className="qq-duplicate-box">
                <div>
                  <strong>這個 BOM 已上傳過</strong>
                  <span>{pendingDuplicate.fileName} 已有 Case：{pendingDuplicate.caseId}</span>
                </div>
                <button className="btn solid" onClick={replaceDuplicateCase}>
                  重新上傳
                </button>
                <button className="btn" onClick={continueExistingCase}>
                  用舊檔案繼續查詢
                </button>
              </div>
            )}
            {hqewResult && (
              <div className="qq-query-note">
                已查詢 <span className="mono">{hqewResult.partNumber}</span>；下方推薦供應商已切換為華強電子網解析結果。
              </div>
            )}
          </div>
        </section>

        <section className="qq-grid">
          <div className="card">
            <div className="card-hd">
              <h3><Icon name="compare" size={14} />詢價任務清單</h3>
              <span className="sub">{hqewResult ? '每家供應商都有獨立 RFQ 編號' : '華強電子網前 3 家候選示例'}</span>
            </div>
            <div className="card-bd flush">
              <div className="qq-table-scroll">
              <table className="qq-table">
                <thead>
                  <tr>
                    <th>RFQ</th>
                    <th>供應商</th>
                    <th>料號</th>
                    <th>庫存</th>
                    <th>倉庫</th>
                    <th>QQ</th>
                  </tr>
                </thead>
                <tbody>
                  {hqewRows.map((row, idx) => (
                    <tr key={`${row.supplier}-${idx}`} className={selected === idx ? 'selected' : ''} onClick={() => setSelected(idx)}>
                      <td>
                        <span className="qq-rfq-badge">{row.rfqId}</span>
                      </td>
                      <td>
                        <strong>{row.supplier}</strong>
                        <span>{row.note}</span>
                      </td>
                      <td className="mono">{row.mpn}</td>
                      <td className="mono">{row.stock.toLocaleString()}</td>
                      <td>{row.location}</td>
                      <td>
                        {row.qqHref || row.qq ? (
                          <button
                            className={`qq-link-btn qidian-link-btn ${copiedInquiryQq === row.rfqId ? 'copied-success' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              void openSupplierQq(row);
                            }}
                            title="點擊：複製詢價內容並開啟 QQ 對話自動貼上；若對方未開通臨時會話會提示手動加好友"
                          >
                            {copiedInquiryQq === row.rfqId
                              ? qqOpenOutcome === 'manual'
                                ? `✓ 已複製，請手動加 ${row.qq || '好友'}`
                                : pasteHelperOnline === false
                                  ? '✓ 已複製，正在開 QQ（請手動 ⌘V）'
                                  : '✓ 已複製，正在開 QQ'
                              : `QQ ${row.qq || '開啟'}`}
                          </button>
                        ) : (
                          <span className="qq-muted">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>

          <div className="qq-panel-stack">
            <div className="card">
              <div className="card-hd">
                <h3><Icon name="message" size={14} />人工確認詢價內容</h3>
                <span className="sub">送出前可人工微調</span>
              </div>
              <div className="card-bd">
                <textarea className="qq-textarea mono" value={message} readOnly />
                <div className="qq-actions">
                  <button className="btn solid" onClick={copyMessage}>
                    <Icon name="copy" size={13} />複製到 QQ / 微信
                  </button>
                  <a className="btn" href={`mailto:?subject=${encodeURIComponent(`詢價 ${current.mpn}`)}&body=${encodeURIComponent(message)}`}>
                    <Icon name="message" size={13} />Email
                  </a>
                  <a className="btn" href={hqewSearchUrl(current.mpn)} target="_blank" rel="noreferrer">
                    <Icon name="external" size={13} />華強頁面
                  </a>
                  <button className="btn" onClick={copyAndOpenHqew}>
                    <Icon name="copy" size={13} />複製並開華強
                  </button>
                </div>
                <p className="qq-helper-text">
                  點 QQ 會複製詢價內容，並以企點簽章連結直達該供應商臨時會話；裝有自動貼上助手時會自動切到 QQ 貼上（不會自動送出，確認後再按 Enter）。若對方未開通臨時會話（個人 QQ），只會複製內容並提示手動加好友後 Cmd+V。
                </p>
                {pasteHelperOnline === true && (
                  <p className="qq-paste-status online">✓ 自動貼上助手已連線（Hammerspoon）</p>
                )}
                {pasteHelperOnline === false && (
                  <div className="qq-paste-status offline">
                    <strong>未偵測到自動貼上助手</strong>
                    <span>點 QQ 仍會複製內容並開啟對話，但需自行按 ⌘V 貼上。想要自動貼上，照以下步驟安裝一次（不用打指令、全程滑鼠）：</span>
                    <ol>
                      <li>下載安裝 <a href="https://www.hammerspoon.org/" target="_blank" rel="noreferrer">Hammerspoon</a>（免費）：打開下載的 zip，把鎚子圖示拖進「應用程式」，然後打開它</li>
                      <li>點螢幕右上選單列的<strong>鎚子圖示</strong> → 選「<strong>Console</strong>」</li>
                      <li>按下方「複製安裝指令」，在 Console 最下面的輸入列<strong>貼上（⌘V）→ 按 Enter</strong>，看到「helper loaded」提示即完成（指令已內含程式檔，執行時不需連網）</li>
                      <li>若跳出權限詢問請允許；或到「系統設定 → 隱私權與安全性 → 輔助使用」開啟 Hammerspoon</li>
                      <li>回到本頁按「重新偵測」，變綠色就可以用了</li>
                    </ol>
                    <div className="qq-paste-actions">
                      <button
                        type="button"
                        className="btn solid"
                        onClick={() => {
                          void (async () => {
                            const cmd = await buildConsoleInstallCommand();
                            if (!cmd) {
                              window.alert('產生安裝指令失敗，請重新整理頁面再試');
                              return;
                            }
                            await navigator.clipboard.writeText(cmd);
                            setCopiedInstallCmd(true);
                            window.setTimeout(() => setCopiedInstallCmd(false), 2500);
                          })();
                        }}
                      >
                        {copiedInstallCmd ? '✓ 已複製，去 Hammerspoon Console 貼上' : '複製安裝指令'}
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => { setPasteHelperOnline(null); void detectPasteHelper().then(setPasteHelperOnline); }}
                      >
                        重新偵測
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-hd">
                <h3><Icon name="zap" size={14} />回覆解析</h3>
                <span className="sub">從 QQ 一鍵讀取，或手動貼上回覆</span>
              </div>
              <div className="card-bd">
                <div className="qq-actions">
                  <button className="btn solid" onClick={() => void readReplyFromQq()} disabled={qqReading}>
                    <Icon name="zap" size={13} />{qqReading ? '讀取 QQ 對話中...' : '讀取 QQ 回覆（導讀）'}
                  </button>
                </div>
                {qqCaptureNote && (
                  <div className={`qq-capture-note ${qqCaptureNote.kind}`}>{qqCaptureNote.text}</div>
                )}
                <div className="qq-reply-source">
                  <label htmlFor="reply-source">回覆來源</label>
                  <select
                    id="reply-source"
                    value={selected}
                    disabled={Boolean(detectedRow)}
                    onChange={(e) => setSelected(Number(e.target.value))}
                  >
                    {hqewRows.map((row, idx) => (
                      <option key={`${row.supplier}-source-${idx}`} value={idx}>
                        {row.rfqId} / {row.supplier}{row.qq ? ` / QQ ${row.qq}` : ''}
                      </option>
                    ))}
                  </select>
                  <span className={detectedRow ? 'matched' : ''}>
                    {detectedRow
                      ? `已從回覆文字自動配對：${quoteTarget.rfqId} / ${quoteTarget.supplier}`
                      : `未偵測到 RFQ 編號，將使用手動來源：${quoteTarget.supplier}${quoteTarget.qq ? `（QQ ${quoteTarget.qq}）` : ''}`}
                  </span>
                </div>
                <textarea
                  className="qq-textarea reply"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="貼上供應商 QQ / 微信 / Email 回覆..."
                />
                <div className="qq-parse-grid">
                  <div><span>單價</span><strong>{parsed.price}</strong></div>
                  <div><span>庫存</span><strong>{parsed.stock}</strong></div>
                  <div><span>MOQ</span><strong>{parsed.moq}</strong></div>
                  <div><span>交期</span><strong>{parsed.leadTime}</strong></div>
                  <div><span>批號</span><strong>{parsed.batch}</strong></div>
                  <div><span>報價有效期</span><strong>{parsed.validity}</strong></div>
                  <div><span>品牌（回覆）</span><strong>{parsed.brand}</strong></div>
                  <div>
                    <span>料號比對</span>
                    <strong className={reply.toUpperCase().includes(quoteTarget.mpn.toUpperCase()) ? 'mpn-match' : 'mpn-miss'}>
                      {reply.toUpperCase().includes(quoteTarget.mpn.toUpperCase())
                        ? `✓ 回覆含 ${quoteTarget.mpn}`
                        : `⚠ 回覆未提及 ${quoteTarget.mpn}`}
                    </strong>
                  </div>
                </div>
                <div className="qq-actions">
                  <button
                    className={'btn solid' + (savedQuoteId === quoteTarget.rfqId ? ' success' : '')}
                    onClick={addQuoteRecord}
                  >
                    <Icon name="check" size={13} />
                    {savedQuoteId === quoteTarget.rfqId ? '已加入報價' : '加入報價紀錄'}
                  </button>
                  <button className="btn" onClick={exportBomWithQuotes} disabled={!quoteRecords.length}>
                    <Icon name="download" size={13} />匯出回填 BOM
                  </button>
                </div>
                <div className="qq-sample-replies">
                  <div className="qq-sample-title">
                    <strong>測試回覆範例</strong>
                    <span>可複製任一段貼到上方正式回覆區測試 RFQ 自動配對</span>
                  </div>
                  {sampleReplies.map((sample, idx) => (
                    <div key={`${hqewRows[idx]?.rfqId}-sample`} className="qq-sample-reply">
                      <div>
                        <strong>{hqewRows[idx]?.supplier}</strong>
                        <span className="mono">{hqewRows[idx]?.rfqId}</span>
                      </div>
                      <pre>{sample}</pre>
                      <button
                        className={'btn' + (copiedSampleIdx === idx ? ' success' : '')}
                        onClick={() => void copySampleReply(sample, idx)}
                      >
                        <Icon name={copiedSampleIdx === idx ? 'check' : 'copy'} size={13} />
                        {copiedSampleIdx === idx ? '已複製' : '複製測試回覆'}
                      </button>
                    </div>
                  ))}
                </div>
                {quoteRecords.length > 0 && (
                  <div className="qq-records">
                    {quoteRecords.map((record) => (
                      <div key={record.id} className="qq-record-row">
                        <strong>{record.rfqId ?? record.mpn}</strong>
                        <span>{record.supplier}</span>
                        <span>{record.unitPrice} / 庫存 {record.stock} / MOQ {record.moq}</span>
                        <span>{record.savedAt}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
