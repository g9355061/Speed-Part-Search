'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx-js-style';
import { Header } from '@/components/Header';
import { Icon } from '@/components/Icon';

interface BomRow {
  mpn: string;
  qty: number;
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
  const price = text.match(/(?:單價|价格|價格|含稅|含税|RMB|￥)\s*[:：]?\s*(?:RMB|￥)?\s*([0-9]+(?:\.[0-9]+)?)/i)?.[1];
  const stock = text.match(/(?:庫存|库存|現貨|现货)\s*[:：]?\s*([0-9,]+)/i)?.[1];
  const leadTime =
    text.match(/(?:交期|發貨|发货)\s*[:：]?\s*([^\n，,。]+)/i)?.[1] ??
    text.match(/(今天可[發发]貨|明天可[發发]貨|現貨|现货|[0-9]+\s*天)/i)?.[1];
  const moq = text.match(/(?:MOQ|起訂|起订)\s*[:：]?\s*([0-9,]+)/i)?.[1];
  return {
    price: price ? `￥${price}` : '待確認',
    stock: stock ?? '待確認',
    leadTime: leadTime ?? '待確認',
    moq: moq ?? '待確認',
  };
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

  let headerIdx = 0;
  for (let r = 0; r < Math.min(8, raw.length); r++) {
    if (raw[r].some((c) => /part|mpn|料號|料号/i.test(String(c)))) {
      headerIdx = r;
      break;
    }
  }

  const headers = (raw[headerIdx] as string[]).map((h) => String(h).toLowerCase().trim());
  const mpnCol = headers.findIndex((h) => /part|mpn|料號|料号/.test(h));
  const qtyCol = headers.findIndex((h) => /qty|quantity|數量|数量|pcs|demand|shortage|需求/.test(h));
  if (mpnCol === -1) throw new Error('找不到料號欄位：請使用 Part Number / MPN / 料號');

  const rows: BomRow[] = [];
  for (let r = headerIdx + 1; r < raw.length; r++) {
    const row = raw[r] as unknown[];
    const mpn = String(row[mpnCol] ?? '').trim();
    if (!mpn) continue;
    rows.push({ mpn, qty: qtyCol !== -1 ? parseQuantityValue(row[qtyCol]) : 1 });
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

function qqWpaUrl(qq?: string) {
  const cleanQq = qq?.replace(/\D/g, '');
  return cleanQq ? `http://wpa.qq.com/msgrd?v=3&uin=${cleanQq}&exe=qq&site=hqew&menu=no` : '';
}

function triggerLocalQqPasteHelper() {
  window.setTimeout(() => {
    fetch('http://127.0.0.1:5299/paste', {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
    }).catch(() => undefined);
  }, 350);
}

export default function QqInquiryPage() {
  const [selected, setSelected] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copiedInquiryQq, setCopiedInquiryQq] = useState<string | null>(null);
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
    window.setTimeout(() => setCopiedInquiryQq(null), 3200);

    const targetHref = row.qqHref || qqWpaUrl(row.qq);
    if (targetHref) {
      window.open(targetHref, '_blank', 'noopener,noreferrer');
      triggerLocalQqPasteHelper();
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
                            title="點擊：複製詢價內容並開啟華強解析出的 QQ 入口"
                          >
                            {copiedInquiryQq === row.rfqId
                              ? '✓ 已複製，正在開 QQ'
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
                  點 QQ 會先複製詢價內容並開啟華強解析出的 QQ 入口；本機 helper 啟動後會自動切到 QQ 並貼上，不會自動送出。
                </p>
              </div>
            </div>

            <div className="card">
              <div className="card-hd">
                <h3><Icon name="zap" size={14} />回覆解析</h3>
                <span className="sub">先貼回文字，後續再接自動擷取</span>
              </div>
              <div className="card-bd">
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
