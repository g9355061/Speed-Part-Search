'use client';
import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx-js-style';
import { Icon } from '@/components/Icon';

/* ══════════════════════════════════════════
   Types
══════════════════════════════════════════ */
interface BomRow { mpn: string; qty: number }

type RowStatus = 'pending' | 'searching' | 'found' | 'error' | 'notfound' | 'restricted' | 'limited' | 'auth' | 'skipped';

interface PriceSplitLine {
  label: string;
  qty: number;
  unitPrice: number;
  subtotal: number;
}

interface SupplierData {
  status: RowStatus;
  shortage?: boolean;
  stock?: number;
  moq?: number;   // 最小可買量
  mpq?: number;   // 整包 / 捲帶量
  unitPrice?: number;
  currency?: string;
  priceBreaks?: ApiPriceBreak[];
  leadTime?: string;
  productUrl?: string;
  errorMsg?: string;
  split?: PriceSplitLine[];
  totalCost?: number;
  marketplaceVariations?: ApiMarketplaceVariation[];
}

interface ResultRow extends BomRow {
  digikey: SupplierData;
  mouser: SupplierData;
  mouserHk: SupplierData;
  mouserVn: SupplierData;
}

/* API shapes */
interface ApiPriceBreak { quantity: number; unitPrice: number; currency: string }
interface ApiVariation {
  packageType: 'TR' | 'CT' | 'DKR' | 'OTHER';
  minQty: number;
  breaks: ApiPriceBreak[];
}
interface ApiMarketplaceVariation {
  supplierName: string;
  stockQty: number;
  minQty: number;
  breaks: ApiPriceBreak[];
}
interface ApiPartResult {
  quantityAvailable: number;
  unitPrice: number | null;
  currency: string;
  priceBreaks: ApiPriceBreak[];
  variations?: ApiVariation[];
  marketplaceVariations?: ApiMarketplaceVariation[];
  productUrl: string;
  leadTimeDays?: number | null;
}
interface ApiSupplierBlock {
  supplier: string;
  results: ApiPartResult[];
  error?: { code: string; message: string };
}
interface ApiSearchResponse {
  partNumber: string;
  suppliers: ApiSupplierBlock[];
}

/* ══════════════════════════════════════════
   Price helpers
══════════════════════════════════════════ */
function breaksPrice(breaks: ApiPriceBreak[], qty: number): number | undefined {
  if (!breaks.length || qty <= 0) return undefined;
  let last: number | undefined;
  for (const b of breaks) if (qty >= b.quantity) last = b.unitPrice;
  return last;
}

function priceAtQty(breaks: ApiPriceBreak[], qty: number, stock: number): number | undefined {
  const effectiveQty = stock > 0 && qty > stock ? stock : qty;
  let last: number | undefined;
  for (const b of breaks) if (effectiveQty >= b.quantity) last = b.unitPrice;
  return last;
}

function samePriceBreaks(a: ApiPriceBreak[], b: ApiPriceBreak[]): boolean {
  return a.length === b.length && a.every((x, i) =>
    x.quantity === b[i].quantity && Math.abs(x.unitPrice - b[i].unitPrice) < 0.00001
  );
}

function calcSplit(
  variations: ApiVariation[], qty: number
): { split: PriceSplitLine[]; totalCost: number } | undefined {
  // 找有效 variation：minQty > 0 且有 price breaks
  const valid = [...variations].filter((v) => v.minQty > 0 && v.breaks.length > 0);
  if (valid.length < 2) return undefined;

  // 按 minQty 排序：最大 = MPQ（整包/捲帶），最小 = MOQ（散料/最小訂購）
  valid.sort((a, b) => b.minQty - a.minQty);
  const mpqVar = valid[0];
  const moqVar = valid[valid.length - 1];

  if (mpqVar.minQty === moqVar.minQty) return undefined; // 同一包裝不拆
  if (qty < mpqVar.minQty) return undefined;             // 未達整包數量不拆

  const mpqQty = Math.floor(qty / mpqVar.minQty) * mpqVar.minQty;
  const moqQty = qty - mpqQty;

  // 統一標籤：大包裝 = TR（捲帶），小包裝 = CT（散裝）
  // Mouser 只有一組總數量階梯價；若 TR/CT 共用同一組 breaks，兩段都套總數量單價。
  const sharedBreaks = samePriceBreaks(mpqVar.breaks, moqVar.breaks);
  const sharedPrice = sharedBreaks ? breaksPrice(mpqVar.breaks, qty) : undefined;
  const mpqPrice = sharedPrice ?? breaksPrice(mpqVar.breaks, mpqQty);
  if (mpqPrice == null) return undefined;

  const lines: PriceSplitLine[] = [
    { label: `TR × ${mpqQty.toLocaleString()}`, qty: mpqQty, unitPrice: mpqPrice, subtotal: mpqQty * mpqPrice },
  ];
  if (moqQty > 0) {
    const moqPrice = sharedPrice ?? breaksPrice(moqVar.breaks, moqQty) ?? breaksPrice(moqVar.breaks, 1);
    if (moqPrice == null) return undefined;
    lines.push({ label: `CT × ${moqQty.toLocaleString()}`, qty: moqQty, unitPrice: moqPrice, subtotal: moqQty * moqPrice });
  }
  return { split: lines, totalCost: lines.reduce((s, l) => s + l.subtotal, 0) };
}

function leadLabel(days?: number | null): string {
  if (days == null) return '—';
  if (days === 0) return 'Ships today';
  if (days < 14) return `${days}d`;
  return `${Math.round(days / 7)}w`;
}

function parseQuantityValue(value: unknown, isShortageColumn: boolean): number {
  const raw = String(value ?? '').trim();
  const numeric = typeof value === 'number'
    ? value
    : Number(raw.replace(/,/g, '').replace(/^\((.*)\)$/, '-$1'));
  if (!Number.isFinite(numeric) || numeric === 0) return 1;
  const qty = isShortageColumn ? Math.abs(numeric) : numeric;
  return qty > 0 ? Math.round(qty) : 1;
}

function mapSupplier(block: ApiSupplierBlock | undefined, qty: number): SupplierData {
  if (!block) return { status: 'notfound' };
  if (block.error) {
    const supplier = block.supplier.toLowerCase();
    if (block.error.code === 'EMPTY_RESULT' || block.error.code === 'NOT_FOUND') {
      return { status: 'notfound' };
    }
    if (block.error.code === 'RESTRICTED') {
      return { status: 'restricted', errorMsg: 'Restricted' };
    }
    if (block.error.code === 'RATE_LIMITED' || (supplier === 'digikey' && block.error.code === 'AUTH_FAILED')) {
      const isMouserDailyLimit = /MaxCallPerDay|Maximum calls per day exceeded/i.test(block.error.message);
      return {
        status: 'limited',
        errorMsg: supplier === 'digikey'
          ? 'Resets TW 08:00'
          : isMouserDailyLimit ? 'Daily limit' : 'Rate limit',
      };
    }
    if (block.error.code === 'AUTH_FAILED') {
      return { status: 'auth', errorMsg: 'Check API key' };
    }
    return { status: 'error', errorMsg: block.error.code };
  }
  const r = block.results[0];
  if (!r) return { status: 'notfound' };

  const stock = r.quantityAvailable;
  const shortage = stock < qty;
  const purchasableQty = Math.max(0, Math.min(qty, stock));
  const effectiveQty = shortage ? purchasableQty : qty;

  const price = priceAtQty(r.priceBreaks, qty, stock) ?? r.unitPrice ?? undefined;
  const splitResult = effectiveQty > 0 && r.variations ? calcSplit(r.variations, effectiveQty) : undefined;
  const totalCost = effectiveQty > 0
    ? splitResult?.totalCost ?? (price != null ? price * effectiveQty : undefined)
    : undefined;

  const allMinQty = (r.variations ?? []).map((v) => v.minQty).filter((n) => n > 0);
  const moq = allMinQty.length ? Math.min(...allMinQty) : r.priceBreaks[0]?.quantity;
  const mpqCandidate = allMinQty.length ? Math.max(...allMinQty) : undefined;
  const mpq = mpqCandidate !== moq ? mpqCandidate : undefined; // 若 MOQ=MPQ 不顯示 MPQ

  return {
    status: 'found',
    shortage,
    stock,
    moq,
    mpq,
    unitPrice: price,
    currency: r.currency || 'USD',
    priceBreaks: r.priceBreaks,
    leadTime: leadLabel(r.leadTimeDays),
    productUrl: r.productUrl,
    ...(splitResult ? { split: splitResult.split } : {}),
    totalCost,
    ...(r.marketplaceVariations?.length ? { marketplaceVariations: r.marketplaceVariations } : {}),
  };
}

/* ══════════════════════════════════════════
   Search engine
══════════════════════════════════════════ */
const CONCURRENCY = 2;
const RETRY_DELAYS = [5000, 12000]; // 第1次 retry 等 5s，第2次等 12s

function needsRetry(block: ApiSupplierBlock | undefined): boolean {
  const code = block?.error?.code;
  if (code !== 'RATE_LIMITED') return false;
  if (/MaxCallPerDay|Maximum calls per day exceeded/i.test(block?.error?.message ?? '')) return false;
  return block?.supplier.toLowerCase() !== 'digikey';
}

function shouldDisableSupplier(block: ApiSupplierBlock | undefined): boolean {
  if (!block?.error) return false;
  const code = block.error.code;
  return code === 'RATE_LIMITED' || code === 'AUTH_FAILED';
}

type SupplierKey = 'digikey' | 'mouser' | 'mouserHk' | 'mouserVn';
const SUPPLIER_KEYS: SupplierKey[] = ['digikey', 'mouserHk', 'mouserVn'];
const SUPPLIER_QUERY_NAMES: Record<SupplierKey, string> = {
  digikey: 'digikey',
  mouser: 'mouser',
  mouserHk: 'mouser hk',
  mouserVn: 'mouser vn',
};

async function searchBoth(
  mpn: string,
  qty: number,
  disabled: Set<string>,
  onDisable: (supplier: string) => void,
): Promise<{ digikey: SupplierData; mouser: SupplierData; mouserHk: SupplierData; mouserVn: SupplierData }> {
  // Track per-supplier consecutive RATE_LIMITED counts across retries
  const rateLimitedCount: Record<string, number> = { digikey: 0, mouser: 0, mouserHk: 0, mouserVn: 0 };
  const resolved: Partial<Record<SupplierKey, ApiSupplierBlock | undefined>> = {};
  let retrySuppliers: SupplierKey[] = SUPPLIER_KEYS.filter((s) => !disabled.has(s));

  for (let attempt = 0; attempt < 3; attempt++) {
    const activeSuppliers = retrySuppliers.filter((s) => !disabled.has(s));
    if (!activeSuppliers.length) {
      return {
        digikey: resolved.digikey ? mapSupplier(resolved.digikey, qty) : disabled.has('digikey') ? { status: 'limited', errorMsg: 'Resets TW 08:00' } : mapSupplier(resolved.digikey, qty),
        mouser: { status: 'skipped' },
        mouserHk: resolved.mouserHk ? mapSupplier(resolved.mouserHk, qty) : disabled.has('mouserHk') ? { status: 'skipped' } : mapSupplier(resolved.mouserHk, qty),
        mouserVn: resolved.mouserVn ? mapSupplier(resolved.mouserVn, qty) : disabled.has('mouserVn') ? { status: 'skipped' } : mapSupplier(resolved.mouserVn, qty),
      };
    }

    if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt - 1]));
    try {
      const params = new URLSearchParams({
        partNumber: mpn,
        suppliers: activeSuppliers.map((s) => SUPPLIER_QUERY_NAMES[s]).join(','),
      });
      const resp = await fetch(`/api/search?${params.toString()}`);
      if (!resp.ok) {
        if (attempt < 2) continue;
        const errData: SupplierData = { status: 'error', errorMsg: `HTTP ${resp.status}` };
        return {
          digikey: disabled.has('digikey') ? { status: 'skipped' } : errData,
          mouser:  { status: 'skipped' },
          mouserHk: disabled.has('mouserHk') ? { status: 'skipped' } : errData,
          mouserVn: disabled.has('mouserVn') ? { status: 'skipped' } : errData,
        };
      }
      const json: ApiSearchResponse = await resp.json();
      const dk = json.suppliers.find((b) => b.supplier.toLowerCase() === 'digikey');
      const ms = json.suppliers.find((b) => b.supplier.toLowerCase() === 'mouser');
      const mhk = json.suppliers.find((b) => b.supplier.toLowerCase() === 'mouser hk');
      const mvn = json.suppliers.find((b) => b.supplier.toLowerCase() === 'mouser vn');
      const received: Partial<Record<SupplierKey, ApiSupplierBlock | undefined>> = { digikey: dk, mouser: ms, mouserHk: mhk, mouserVn: mvn };

      // Count supplier limit/auth failures that should stop the remaining batch.
      if (shouldDisableSupplier(dk)) rateLimitedCount.digikey++;
      if (shouldDisableSupplier(ms)) rateLimitedCount.mouser++;
      if (shouldDisableSupplier(mhk)) rateLimitedCount.mouserHk++;
      if (shouldDisableSupplier(mvn)) rateLimitedCount.mouserVn++;

      for (const supplier of activeSuppliers) {
        const block = received[supplier];
        if (!needsRetry(block)) resolved[supplier] = block;
      }

      // DigiKey daily quota/auth failures do not recover by retrying this batch.
      if (shouldDisableSupplier(dk) && !disabled.has('digikey')) {
        disabled.add('digikey');
        onDisable('digikey');
      }
      // Mouser 429/503 can be transient; disable it only after repeated failures.
      if (attempt === 2 && rateLimitedCount.mouser >= 3 && !disabled.has('mouser')) {
        disabled.add('mouser');
        onDisable('mouser');
      }
      if (attempt === 2 && rateLimitedCount.mouserHk >= 3 && !disabled.has('mouserHk')) {
        disabled.add('mouserHk');
        onDisable('mouserHk');
      }
      if (attempt === 2 && rateLimitedCount.mouserVn >= 3 && !disabled.has('mouserVn')) {
        disabled.add('mouserVn');
        onDisable('mouserVn');
      }

      retrySuppliers = activeSuppliers.filter((supplier) => needsRetry(received[supplier]));
      if (attempt < 2 && retrySuppliers.length > 0) continue;

      return {
        digikey: (resolved.digikey ?? dk) ? mapSupplier(resolved.digikey ?? dk, qty) : disabled.has('digikey') ? { status: 'limited', errorMsg: 'Resets TW 08:00' } : mapSupplier(undefined, qty),
        mouser:  { status: 'skipped' },
        mouserHk: (resolved.mouserHk ?? mhk) ? mapSupplier(resolved.mouserHk ?? mhk, qty) : disabled.has('mouserHk') ? { status: 'skipped' } : mapSupplier(undefined, qty),
        mouserVn: (resolved.mouserVn ?? mvn) ? mapSupplier(resolved.mouserVn ?? mvn, qty) : disabled.has('mouserVn') ? { status: 'skipped' } : mapSupplier(undefined, qty),
      };
    } catch {
      if (attempt === 2) return {
        digikey: disabled.has('digikey') ? { status: 'limited', errorMsg: 'Resets TW 08:00' } : { status: 'error', errorMsg: 'Network error' },
        mouser:  { status: 'skipped' },
        mouserHk: disabled.has('mouserHk') ? { status: 'skipped' } : { status: 'error', errorMsg: 'Network error' },
        mouserVn: disabled.has('mouserVn') ? { status: 'skipped' } : { status: 'error', errorMsg: 'Network error' },
      };
    }
  }
  return {
    digikey: disabled.has('digikey') ? { status: 'limited', errorMsg: 'Resets TW 08:00' } : { status: 'error', errorMsg: 'Max retries' },
    mouser:  { status: 'skipped' },
    mouserHk: disabled.has('mouserHk') ? { status: 'skipped' } : { status: 'error', errorMsg: 'Max retries' },
    mouserVn: disabled.has('mouserVn') ? { status: 'skipped' } : { status: 'error', errorMsg: 'Max retries' },
  };
}

async function runBatch(
  rows: BomRow[],
  onUpdate: (idx: number, update: Partial<ResultRow>) => void,
  onDisable: (supplier: string) => void,
  shouldStop?: () => boolean,
): Promise<void> {
  const disabled = new Set<string>();
  let i = 0;
  async function worker() {
    while (i < rows.length && !shouldStop?.()) {
      const idx = i++;
      if (shouldStop?.()) {
        onUpdate(idx, {
          digikey: { status: 'skipped' },
          mouser: { status: 'skipped' },
          mouserHk: { status: 'skipped' },
          mouserVn: { status: 'skipped' },
        });
        break;
      }
      const { mpn, qty } = rows[idx];
      onUpdate(idx, {
        digikey: disabled.has('digikey') ? { status: 'limited', errorMsg: 'Resets TW 08:00' } : { status: 'searching' },
        mouser:  { status: 'skipped' },
        mouserHk: disabled.has('mouserHk') ? { status: 'skipped' } : { status: 'searching' },
        mouserVn: disabled.has('mouserVn') ? { status: 'skipped' } : { status: 'searching' },
      });
      const result = await searchBoth(mpn, qty, disabled, onDisable);
      onUpdate(idx, result);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));
  if (shouldStop?.()) {
    for (let idx = i; idx < rows.length; idx++) {
      onUpdate(idx, {
        digikey: { status: 'skipped' },
        mouser: { status: 'skipped' },
        mouserHk: { status: 'skipped' },
        mouserVn: { status: 'skipped' },
      });
    }
  }
}

/* ══════════════════════════════════════════
   Excel helpers
══════════════════════════════════════════ */
async function parseExcel(file: File): Promise<BomRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  let headerIdx = 0;
  for (let r = 0; r < Math.min(5, raw.length); r++) {
    if (raw[r].some((c) => /part|mpn|料號/i.test(String(c)))) { headerIdx = r; break; }
  }
  const headers = (raw[headerIdx] as string[]).map((h) => String(h).toLowerCase().trim());
  const mpnCol = headers.findIndex((h) => /part|mpn|料號/.test(h));
  // 支援欄位名：qty / quantity / 數量 / pcs / demand / shortage / 需求 / 需求量 / 需求數量
  const qtyCol = headers.findIndex((h) => /qty|quantity|數量|pcs|demand|shortage|需求/.test(h));
  const isShortageCol = qtyCol !== -1 && /shortage/.test(headers[qtyCol]);
  if (mpnCol === -1) throw new Error('找不到料號欄位 (Part Number / MPN / 料號)');

  const rows: BomRow[] = [];
  for (let r = headerIdx + 1; r < raw.length; r++) {
    const row = raw[r] as unknown[];
    const mpn = String(row[mpnCol] ?? '').trim();
    if (!mpn) continue;
    const qty = qtyCol !== -1 ? parseQuantityValue(row[qtyCol], isShortageCol) : 1;
    rows.push({ mpn, qty });
  }
  return rows;
}

const THIN_BORDER = {
  top: { style: 'thin', color: { rgb: 'E3E7EC' } },
  bottom: { style: 'thin', color: { rgb: 'E3E7EC' } },
  left: { style: 'thin', color: { rgb: 'E3E7EC' } },
  right: { style: 'thin', color: { rgb: 'E3E7EC' } },
};

const SUPPLIER_EXPORT_GROUPS = [
  { start: 4, end: 9, header: '1565C0', fill: 'F4F8FF' },
  { start: 10, end: 15, header: 'EF6C00', fill: 'FFF3E8' },
  { start: 16, end: 21, header: '047857', fill: 'ECFDF5' },
];

const EXPORT_COL_WIDTHS = [
  26, 9, 16, 14,
  13, 18, 24, 12, 12, 14,
  14, 18, 24, 12, 12, 14,
  14, 18, 24, 12, 12, 14,
];

function exportCellStyle(fill: string, opts: { bold?: boolean; color?: string; align?: 'left' | 'center' | 'right'; numFmt?: string } = {}) {
  return {
    fill: { patternType: 'solid', fgColor: { rgb: fill } },
    font: { name: 'Aptos', sz: 11, bold: opts.bold ?? false, color: { rgb: opts.color ?? '0B1220' } },
    alignment: { horizontal: opts.align ?? 'left', vertical: 'center', wrapText: true },
    border: THIN_BORDER,
    ...(opts.numFmt ? { numFmt: opts.numFmt } : {}),
  };
}

function estimatedRowHeight(values: unknown[]): number {
  const detailColumns = [6, 12, 18];
  const maxLines = Math.max(
    1,
    ...detailColumns.map((c) => {
      const text = String(values[c] ?? '');
      if (!text) return 1;
      const explicitLines = text.split('\n').length;
      const wrappedLines = Math.ceil(text.length / 28);
      return Math.max(explicitLines, wrappedLines);
    })
  );
  return Math.min(96, Math.max(22, maxLines * 18 + 6));
}

function styleResultsSheet(ws: XLSX.WorkSheet, rowCount: number) {
  ws['!cols'] = EXPORT_COL_WIDTHS.map((wch) => ({ wch }));
  ws['!rows'] = Array.from({ length: rowCount }, (_, i) => {
    if (i === 0 || i === 1) return { hpt: 26 };
    const values = Array.from({ length: 22 }, (_, c) => ws[XLSX.utils.encode_cell({ r: i, c })]?.v ?? '');
    return { hpt: estimatedRowHeight(values) };
  });
  ws['!autofilter'] = { ref: `A2:V${rowCount}` };
  ws['!merges'] = [
    { s: { r: 0, c: 4 }, e: { r: 0, c: 9 } },
    { s: { r: 0, c: 10 }, e: { r: 0, c: 15 } },
    { s: { r: 0, c: 16 }, e: { r: 0, c: 21 } },
  ];

  for (let c = 0; c <= 21; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    const group = SUPPLIER_EXPORT_GROUPS.find((g) => c >= g.start && c <= g.end);
    if (ws[addr]) {
      ws[addr].s = exportCellStyle(group?.header ?? '263238', { bold: true, color: 'FFFFFF', align: 'center' });
    }
  }
  for (let c = 0; c <= 21; c++) {
    const addr = XLSX.utils.encode_cell({ r: 1, c });
    const group = SUPPLIER_EXPORT_GROUPS.find((g) => c >= g.start && c <= g.end);
    if (ws[addr]) {
      ws[addr].s = exportCellStyle(group?.header ?? '263238', { bold: true, color: 'FFFFFF', align: 'center' });
    }
  }

  for (let r = 2; r < rowCount; r++) {
    for (let c = 0; c <= 21; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) continue;
      const group = SUPPLIER_EXPORT_GROUPS.find((g) => c >= g.start && c <= g.end);
      const fill = group?.fill ?? (r % 2 === 0 ? 'FFFFFF' : 'FAFAFA');
      const align = c === 0 || c === 2 || c === 3 || [6, 9, 12, 15, 18, 21].includes(c) ? 'left' : 'right';
      const isTotal = [7, 13, 19].includes(c);
      const isFlatUnit = [8, 14, 20].includes(c);
      ws[addr].s = exportCellStyle(fill, {
        align,
        numFmt: isFlatUnit
          ? '$#,##0.0000;[Red]-$#,##0.0000;-'
          : isTotal ? '$#,##0.0000;[Red]-$#,##0.0000;-' : undefined,
      });
    }

    for (const c of [9, 15, 21]) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) continue;
      const status = String(ws[addr].v ?? '').toLowerCase();
      const fill =
        status === '找到了' ? 'DFF3E3' :
        status === 'restricted' ? 'F1E8FF' :
        status === 'limited' || status === 'auth' || status === 'error' ? 'FCE4E4' :
        status === 'skipped' ? 'EEF1F4' :
        status === '平台沒有這顆料' ? 'FFF2CC' :
        'FAFAFA';
      const color =
        status === '找到了' ? '0B6E3F' :
        status === 'restricted' ? '6D28D9' :
        status === 'limited' || status === 'auth' || status === 'error' ? 'B33A3A' :
        status === '平台沒有這顆料' ? '92400E' :
        '6B7787';
      ws[addr].s = exportCellStyle(fill, { bold: true, color, align: 'center' });
    }
  }
}

async function downloadTemplate() {
  const data = [
    ['Part Number (MPN)', 'Quantity (數量)'],
    ['STM32F103C8T6', 100],
    ['NE555P', 50],
    ['LM1117MPX-3.3/NOPB', 2000],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 22 }, { wch: 18 }];
  ws['!autofilter'] = { ref: 'A1:B4' };
  ws['!rows'] = [{ hpt: 24 }, { hpt: 22 }, { hpt: 22 }, { hpt: 22 }];
  ws['A1'].s = exportCellStyle('263238', { bold: true, color: 'FFFFFF', align: 'center' });
  ws['B1'].s = exportCellStyle('263238', { bold: true, color: 'FFFFFF', align: 'center' });
  for (let r = 1; r <= 3; r++) {
    for (let c = 0; c <= 1; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      ws[addr].s = exportCellStyle(r % 2 === 0 ? 'FFFFFF' : 'FAFAFA', { align: c === 0 ? 'left' : 'right' });
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BOM');
  XLSX.writeFile(wb, 'SpeedPart_BOM_Template.xlsx');
}

async function exportResults(rows: ResultRow[]) {
  const sup = (s: SupplierData, qty: number) => {
    if (s.status === 'skipped') return ['', '', 'Skipped', '', '', 'Skipped'];
    if (s.status === 'restricted') return ['', '', '供貨限制', '', '', '供貨限制'];
    if (s.status === 'limited') return ['', '', s.errorMsg ?? 'Limit exceeded', '', '', 'Limit'];
    if (s.status === 'auth') return ['', '', s.errorMsg ?? 'Auth failed', '', '', 'Auth'];
    const detail = s.split
      ? s.split.map((l) => `${l.label} @ $${l.unitPrice.toFixed(4)}`).join('\n')
      : s.unitPrice != null ? `$${s.unitPrice.toFixed(4)}` : '';
    const divisor = s.shortage ? (s.stock ?? 0) : qty;
    const avg = s.totalCost != null && divisor > 0 ? s.totalCost / divisor : '';
    const mpq = s.mpq ?? s.moq ?? '';
    return [
      s.stock ?? '', mpq,
      detail,
      s.totalCost != null ? s.totalCost : '',
      avg,
      statusLabel(s.status, s.errorMsg),
    ];
  };
	  const data = [
	    ['', '', '', '', 'DigiKey', '', '', '', '', '', 'Mouser HK', '', '', '', '', '', 'Mouser VN', '', '', '', '', ''],
	    ['MPN', 'Qty', '最低供應商', '滿足狀態',
	      'Stock', 'MPQ', '報價', '總價', '平均單價', '狀態',
	      'Stock', 'MPQ', '報價', '總價', '平均單價', '狀態',
	      'Stock', 'MPQ', '報價', '總價', '平均單價', '狀態'],
	    ...rows.map((r) => {
        const summary = bestOfferSummary(r);
        return [r.mpn, r.qty, summary.supplier, summary.fulfillment, ...sup(r.digikey, r.qty), ...sup(r.mouserHk, r.qty), ...sup(r.mouserVn, r.qty)];
      }),
	  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  styleResultsSheet(ws, data.length);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Results');
  XLSX.writeFile(wb, `SpeedPart_Results_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/* ══════════════════════════════════════════
   Sub-components
══════════════════════════════════════════ */
function statusLabel(status: RowStatus, errorMsg?: string): string {
  const map: Record<RowStatus, { label: string; cls: string }> = {
    pending:   { label: '待查詢',    cls: 'badge-gray' },
    searching: { label: '查詢中…',    cls: 'badge-blue' },
    found:     { label: '找到了',      cls: 'badge-green' },
    notfound:  { label: '平台沒有這顆料',  cls: 'badge-warn' },
    restricted:{ label: '供貨限制', cls: 'badge-purple' },
    limited:   { label: 'Limit',      cls: 'badge-red' },
    auth:      { label: 'Auth',       cls: 'badge-red' },
    error:     { label: errorMsg ?? 'Error', cls: 'badge-red' },
    skipped:   { label: 'Skipped',    cls: 'badge-gray' },
  };
  return map[status].label;
}

function StatusBadge({ status, errorMsg }: { status: RowStatus; errorMsg?: string }) {
  const map: Record<RowStatus, { label: string; cls: string }> = {
    pending:   { label: statusLabel(status),    cls: 'badge-gray' },
    searching: { label: statusLabel(status),    cls: 'badge-blue' },
    found:     { label: statusLabel(status),      cls: 'badge-green' },
    notfound:  { label: statusLabel(status),  cls: 'badge-warn' },
    restricted:{ label: statusLabel(status), cls: 'badge-purple' },
    limited:   { label: statusLabel(status),      cls: 'badge-red' },
    auth:      { label: statusLabel(status),       cls: 'badge-red' },
    error:     { label: statusLabel(status, errorMsg), cls: 'badge-red' },
    skipped:   { label: statusLabel(status),    cls: 'badge-gray' },
  };
  const { label, cls } = map[status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 12 };
const dim = { color: 'var(--text-4)' } as React.CSSProperties;

function PriceBreakPopover({
  breaks,
  activePrices,
  children,
}: {
  breaks?: ApiPriceBreak[];
  activePrices?: number[];
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  if (!breaks?.length) return <>{children}</>;
  const isActivePrice = (price: number) =>
    activePrices?.some((active) => Math.abs(active - price) < 0.00001) ?? false;

  return (
    <span
      className="price-popover-anchor"
      onMouseEnter={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && (
        <span
          className="price-popover"
          style={{
            left: Math.min(pos.x + 14, window.innerWidth - 260),
            top: Math.max(pos.y - 12, 12),
          }}
        >
          <span className="price-popover-title">階梯價</span>
          {breaks.map((b) => (
            <span
              key={`${b.quantity}-${b.unitPrice}`}
              className={'price-popover-row' + (isActivePrice(b.unitPrice) ? ' active' : '')}
            >
              <span>Qty &gt;= {b.quantity.toLocaleString()}</span>
              <strong>{b.currency || 'USD'} {b.unitPrice.toFixed(4)}</strong>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

function averageUnitPrice(s: SupplierData, qty: number): number | null {
  if (s.status !== 'found') return null;
  if ((s.stock ?? 0) <= 0) return null;
  const divisor = s.shortage ? (s.stock ?? 0) : qty;
  if (divisor <= 0 || s.totalCost == null) return null;
  return s.totalCost / divisor;
}

function bestOfferSummary(r: ResultRow): { supplier: string; fulfillment: string } {
  const candidates = [
    { label: SUPPLIER_LABELS.digikey, data: r.digikey },
    { label: SUPPLIER_LABELS.mouserHk, data: r.mouserHk },
    { label: SUPPLIER_LABELS.mouserVn, data: r.mouserVn },
  ]
    .map((item) => ({ ...item, avg: averageUnitPrice(item.data, r.qty), fulfills: (item.data.stock ?? 0) >= r.qty }))
    .filter((item) => item.avg != null)
    .sort((a, b) => (a.avg ?? Infinity) - (b.avg ?? Infinity));

  const best = candidates[0];
  if (!best) return { supplier: '—', fulfillment: '—' };
  const bestFulfillment = best.fulfills;
  const tied = candidates.filter((item) =>
    item.fulfills === bestFulfillment && Math.abs((item.avg ?? Infinity) - (best.avg ?? Infinity)) < 0.00001
  );
  return {
    supplier: tied.map((item) => item.label).join(' / '),
    fulfillment: bestFulfillment ? '完全滿足' : '部分滿足',
  };
}

function SupplierCell({ s, qty, name }: { s: SupplierData; qty: number; name: string }) {
  const isSearching = s.status === 'searching';
  const divisor = s.shortage ? (s.stock ?? 0) : qty;
  const avg = s.totalCost != null && divisor > 0 ? s.totalCost / divisor : null;
  const rowBg = s.shortage ? 'var(--warn-soft)' : s.status === 'found' ? 'var(--row-best)' : undefined;

  if (s.status === 'pending' || isSearching) {
    return (
      <>
        <td colSpan={5} style={{ ...mono, textAlign: 'center', background: rowBg, color: 'var(--text-4)', borderLeft: '2px solid var(--border)' }}>
          {isSearching ? '查詢中…' : '—'}
        </td>
        <td style={{ textAlign: 'center', background: rowBg }}>
          <StatusBadge status={s.status} />
        </td>
        <td style={{ background: rowBg }} />
      </>
    );
  }
  if (s.status === 'notfound' || s.status === 'restricted' || s.status === 'limited' || s.status === 'auth' || s.status === 'error' || s.status === 'skipped') {
    const emptyLabel =
      s.status === 'restricted' ? '供貨限制' :
      s.status === 'limited' ? (s.errorMsg ?? 'Limit') :
      s.status === 'auth' ? (s.errorMsg ?? 'Auth') :
      '—';
    return (
      <>
        <td colSpan={5} style={{ ...mono, textAlign: 'center', background: rowBg, color: 'var(--text-4)', borderLeft: '2px solid var(--border)' }}>
          {emptyLabel}
        </td>
        <td style={{ textAlign: 'center', background: rowBg }}>
          <StatusBadge status={s.status} errorMsg={s.errorMsg} />
        </td>
        <td style={{ background: rowBg }} />
      </>
    );
  }

  return (
    <>
      {/* Stock */}
      <td style={{ ...mono, textAlign: 'right', background: rowBg, borderLeft: '2px solid var(--border)' }}>
        <span style={{ color: s.shortage ? 'var(--warn)' : 'inherit' }}>
          {s.shortage ? '⚠ ' : ''}{s.stock?.toLocaleString() ?? '—'}
        </span>
        {s.marketplaceVariations?.map((mv, i) => (
          <div key={i} style={{ marginTop: 3, fontSize: 10, color: 'var(--amber, #b45309)', lineHeight: 1.3, textAlign: 'right' }}>
            <span title="商城產品（外部供應商）">🏪</span> {mv.stockQty.toLocaleString()}
            <div style={{ color: 'var(--text-4)', fontSize: 9.5 }}>{mv.supplierName}</div>
            <div style={{ color: 'var(--text-4)', fontSize: 9.5 }}>MOQ {mv.minQty.toLocaleString()}</div>
          </div>
        ))}
      </td>
      {/* MPQ */}
      <td style={{ ...mono, textAlign: 'right', background: rowBg }}>
        <span style={dim}>{(s.mpq ?? s.moq)?.toLocaleString() ?? '—'}</span>
      </td>
      {/* 報價明細 */}
      <td style={{ ...mono, fontSize: 11.5, background: rowBg }}>
        {s.split ? (
          <PriceBreakPopover breaks={s.priceBreaks} activePrices={s.split.map((line) => line.unitPrice)}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {s.split.map((line, j) => (
                <span key={j} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={dim}>{line.label}</span>
                  <span>@ {line.unitPrice.toFixed(4)}</span>
                </span>
              ))}
            </span>
          </PriceBreakPopover>
        ) : s.unitPrice != null ? (
          <PriceBreakPopover breaks={s.priceBreaks} activePrices={[s.unitPrice]}>
            <span><span style={{ ...dim, fontSize: 10, marginRight: 2 }}>{s.currency}</span>{s.unitPrice.toFixed(4)}</span>
          </PriceBreakPopover>
        ) : <span style={dim}>—</span>}
      </td>
      {/* 總價 */}
      <td style={{ ...mono, textAlign: 'right', fontWeight: 600, background: rowBg }}>
        {s.totalCost != null
          ? `$${s.totalCost.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
          : <span style={dim}>—</span>}
      </td>
      {/* 平均單價 */}
      <td style={{ ...mono, textAlign: 'right', background: rowBg }}>
        {avg != null
          ? <PriceBreakPopover breaks={s.priceBreaks} activePrices={s.unitPrice != null ? [s.unitPrice] : undefined}><span><span style={{ ...dim, fontSize: 10, marginRight: 2 }}>÷{divisor.toLocaleString()}</span>${avg.toFixed(4)}</span></PriceBreakPopover>
          : <span style={dim}>—</span>}
      </td>
      {/* 狀態 */}
      <td style={{ textAlign: 'center', background: rowBg }}>
        <StatusBadge status={s.status} />
      </td>
      {/* 連結 */}
      <td style={{ textAlign: 'center', background: rowBg }}>
        {s.productUrl
          ? <a href={s.productUrl} target="_blank" rel="noreferrer"
              style={{ color: 'var(--primary)', fontSize: 11, textDecoration: 'none' }}>
              {name} ↗
            </a>
          : <span style={dim}>—</span>}
      </td>
    </>
  );
}

/* ══════════════════════════════════════════
   Main page
══════════════════════════════════════════ */
const SUPPLIER_LABELS: Record<string, string> = {
  digikey: 'DigiKey',
  mouserHk: 'Mouser HK',
  mouserVn: 'Mouser VN',
};

export default function BatchPage() {
  const [results, setResults] = useState<ResultRow[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [disabledSuppliers, setDisabledSuppliers] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const stopRef = useRef(false);

  const total = results.length;
  const doneCnt = results.filter((r) => r.digikey.status !== 'pending' && r.digikey.status !== 'searching').length;
  const progress = total > 0 ? Math.round((doneCnt / total) * 100) : 0;
  const shortageCnt = results.filter((r) => r.digikey.shortage || r.mouserHk.shortage || r.mouserVn.shortage).length;

  const handleFile = useCallback(async (file: File) => {
    stopRef.current = false;
    setParseError(null); setDone(false); setStopped(false); setResults([]);
    try {
      const rows = await parseExcel(file);
      if (!rows.length) { setParseError('Excel 裡沒有有效的料號資料'); return; }
      setResults(rows.map((r) => ({
	        ...r,
	        digikey: { status: 'pending' },
	        mouser:  { status: 'skipped' },
	        mouserHk: { status: 'pending' },
	        mouserVn: { status: 'pending' },
      })));
    } catch (e) { setParseError(e instanceof Error ? e.message : String(e)); }
  }, []);

	  const onDrop = (e: React.DragEvent) => {
	    e.preventDefault(); setDragOver(false);
	    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
	  };

	  const reupload = () => {
	    stopRef.current = true;
	    setResults([]);
	    setRunning(false);
	    setDone(false);
	    setStopped(false);
	    setDisabledSuppliers([]);
	    setParseError(null);
	  };

	  const startSearch = async () => {
    if (!results.length || running) return;
    stopRef.current = false;
    setRunning(true); setDone(false); setStopped(false); setDisabledSuppliers([]);
    const bom: BomRow[] = results.map(({ mpn, qty }) => ({ mpn, qty }));
    await runBatch(
      bom,
      (idx, update) => setResults((prev) => prev.map((r, i) => i === idx ? { ...r, ...update } : r)),
      (supplier) => setDisabledSuppliers((prev) => prev.includes(supplier) ? prev : [...prev, supplier]),
      () => stopRef.current,
    );
    setRunning(false); setDone(true); setStopped(stopRef.current);
  };

  const stopSearch = () => {
    stopRef.current = true;
    setStopped(true);
    setResults((prev) => prev.map((r) => {
	      const pending = r.digikey.status === 'pending' && r.mouserHk.status === 'pending' && r.mouserVn.status === 'pending';
      return pending ? { ...r, digikey: { status: 'skipped' }, mouser: { status: 'skipped' }, mouserHk: { status: 'skipped' }, mouserVn: { status: 'skipped' } } : r;
    }));
  };

  return (
    <div className="app">
      <header className="hdr">
        <Link href="/" className="hdr-brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="mark">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="6" y="6" width="12" height="12" rx="1" />
              <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
            </svg>
          </div>
          <div className="name">SpeedPart<span className="dot">.</span></div>
        </Link>
        <nav className="hdr-nav">
	          <Link href="/" className="hdr-nav-link"><Icon name="search" size={14} /><span className="lbl">Search</span></Link>
	          <Link href="/batch" className="hdr-nav-link active"><Icon name="compare" size={14} /><span className="lbl">BOM Batch</span></Link>
	          <Link href="/batch-manufacturer" className="hdr-nav-link"><Icon name="compare" size={14} /><span className="lbl">BOM Batch - MFR</span></Link>
	          <Link href="/manufacturer-mapping" className="hdr-nav-link"><Icon name="compare" size={14} /><span className="lbl">廠商對照表</span></Link>
	        </nav>
      </header>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 24px', width: '100%' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 6px', letterSpacing: '-0.02em' }}>BOM Batch Search</h1>
          <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>
            上傳含料號與數量的 Excel，自動查詢 DigiKey 與 Mouser 即時報價並排比較。
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
	          <button className="btn-primary" onClick={() => fileRef.current?.click()} disabled={running}>
	            <Icon name="search" size={14} /> 上傳 Excel / CSV
	          </button>
	          {results.length > 0 && (
	            <button className="btn" onClick={reupload} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
	              <Icon name="search" size={13} /> 重新上傳
	            </button>
	          )}
	          <button className="btn" onClick={downloadTemplate} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
	            <Icon name="share" size={13} /> 下載範本
	          </button>
          {results.length > 0 && !running && (
            <button className="btn-primary" onClick={startSearch} disabled={done} style={{ marginLeft: 'auto' }}>
              <Icon name="search" size={14} />
              {done ? '查詢完成' : `開始查詢 (${total} 筆)`}
            </button>
          )}
          {running && (
            <button className="btn" onClick={stopSearch} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, borderColor: 'var(--danger)', color: 'var(--danger)' }}>
              停止查詢
            </button>
          )}
          {done && (
            <button className="btn" onClick={() => exportResults(results)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="share" size={13} /> 匯出結果
            </button>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
        </div>

        {results.length === 0 && (
          <div className={'drop-zone' + (dragOver ? ' drag-over' : '')}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}>
            <div style={{ fontSize: 32, marginBottom: 12, color: 'var(--text-4)' }}><Icon name="search" size={36} /></div>
            <p style={{ margin: '0 0 6px', fontWeight: 500, color: 'var(--text-2)' }}>拖放 Excel / CSV 到這裡，或點擊上傳</p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-4)' }}>支援 .xlsx · .xls · .csv，需有 <span className="mono">Part Number</span> 與 <span className="mono">Quantity</span> 欄位</p>
            {parseError && <p style={{ margin: '14px 0 0', color: 'var(--danger)', fontSize: 12 }}>⚠ {parseError}</p>}
          </div>
        )}

        {running && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>
              <span>{stopped ? '正在停止…' : '查詢中…'} {doneCnt} / {total}</span><span>{progress}%</span>
            </div>
            <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 999 }}>
              <div style={{ height: '100%', borderRadius: 999, background: 'var(--primary)', width: `${progress}%`, transition: 'width 0.3s ease' }} />
            </div>
          </div>
        )}

        {stopped && !running && (
          <div style={{
            marginBottom: 16,
            padding: '10px 16px',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 13,
            color: 'var(--text-2)',
          }}>
            查詢已停止；尚未處理的料號已標記為 Skipped。
          </div>
        )}

        {disabledSuppliers.length > 0 && (
          <div style={{
            marginBottom: 16,
            padding: '10px 16px',
            background: '#fff8e1',
            border: '1px solid #f59e0b',
            borderRadius: 8,
            fontSize: 13,
            color: '#92400e',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <span>
              {disabledSuppliers.some((s) => s === 'digikey') && 'DigiKey 已達查詢上限，剩餘料號將只查 Mouser HK / VN；DigiKey 每日額度將於台灣時間 08:00 重置。'}
              {disabledSuppliers.some((s) => s === 'mouserHk') && ' Mouser HK 暫時達到限制，本次批次已略過剩餘 Mouser HK 查詢。'}
              {disabledSuppliers.some((s) => s === 'mouserVn') && ' Mouser VN 暫時達到限制，本次批次已略過剩餘 Mouser VN 查詢。'}
            </span>
          </div>
        )}

        {results.length > 0 && (
          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="card-hd">
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="compare" size={14} />
                BOM 查詢結果
                <span style={{ fontWeight: 400, color: 'var(--text-4)' }}>
                  — {total} 筆
	                  {doneCnt > 0 && `，${results.filter(r => r.digikey.status === 'found').length} 筆 DK / ${results.filter(r => r.mouserHk.status === 'found').length} 筆 HK / ${results.filter(r => r.mouserVn.status === 'found').length} 筆 VN 找到`}
                  {done && shortageCnt > 0 && <span style={{ color: 'var(--warn)', marginLeft: 8 }}>⚠ {shortageCnt} 筆庫存不足</span>}
                </span>
              </h3>
            </div>
            <div className="card-bd flush" style={{ overflowX: 'auto' }}>
	              <table className="sup-tbl" style={{ minWidth: 2160 }}>
                <thead>
                  {/* supplier group header */}
                  <tr>
                    <th className="sticky-col sticky-idx" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }} />
                    <th className="sticky-col sticky-mpn" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }} />
                    <th className="sticky-col sticky-qty" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }} />
                    <th className="sticky-col sticky-best" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }} />
                    <th className="sticky-col sticky-fulfill" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }} />
                    <th colSpan={7} style={{ background: '#e8eef7', borderLeft: '2px solid var(--border)', textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--primary)', borderBottom: '1px solid var(--border)' }}>
                      DigiKey
                    </th>
	                    <th colSpan={7} style={{ background: '#fef7ed', borderLeft: '2px solid var(--border)', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#9a3412', borderBottom: '1px solid var(--border)' }}>
	                      Mouser HK
	                    </th>
                    <th colSpan={7} style={{ background: '#ecfdf5', borderLeft: '2px solid var(--border)', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#047857', borderBottom: '1px solid var(--border)' }}>
                      Mouser VN
                    </th>
                  </tr>
                  {/* column header */}
                  <tr>
                    <th className="sticky-col sticky-idx">#</th>
                    <th className="sticky-col sticky-mpn">料號 (MPN)</th>
                    <th className="sticky-col sticky-qty" style={{ textAlign: 'center' }}>數量</th>
                    <th className="sticky-col sticky-best" style={{ textAlign: 'center' }}>最低供應商</th>
                    <th className="sticky-col sticky-fulfill" style={{ textAlign: 'center' }}>滿足狀態</th>
                    {/* DK cols */}
                    <th style={{ width: 90, textAlign: 'right', borderLeft: '2px solid var(--border)' }}>庫存</th>
                    <th style={{ width: 88, textAlign: 'right' }}>MPQ</th>
                    <th style={{ width: 190 }}>報價明細</th>
                    <th style={{ width: 100, textAlign: 'right' }}>總價</th>
                    <th style={{ width: 110, textAlign: 'right' }}>平均單價</th>
                    <th style={{ width: 72, textAlign: 'center' }}>狀態</th>
                    <th style={{ width: 64, textAlign: 'center' }}>連結</th>
	                    {/* MS HK cols */}
	                    <th style={{ width: 90, textAlign: 'right', borderLeft: '2px solid var(--border)' }}>庫存</th>
                    <th style={{ width: 88, textAlign: 'right' }}>MPQ</th>
                    <th style={{ width: 190 }}>報價明細</th>
                    <th style={{ width: 100, textAlign: 'right' }}>總價</th>
                    <th style={{ width: 110, textAlign: 'right' }}>平均單價</th>
                    <th style={{ width: 72, textAlign: 'center' }}>狀態</th>
                    <th style={{ width: 64, textAlign: 'center' }}>連結</th>
                    {/* MS VN cols */}
                    <th style={{ width: 90, textAlign: 'right', borderLeft: '2px solid var(--border)' }}>庫存</th>
                    <th style={{ width: 88, textAlign: 'right' }}>MPQ</th>
                    <th style={{ width: 190 }}>報價明細</th>
                    <th style={{ width: 100, textAlign: 'right' }}>總價</th>
                    <th style={{ width: 110, textAlign: 'right' }}>平均單價</th>
                    <th style={{ width: 72, textAlign: 'center' }}>狀態</th>
                    <th style={{ width: 64, textAlign: 'center' }}>連結</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i}>
                      {(() => {
                        const summary = bestOfferSummary(r);
                        return (
                          <>
                      <td className="sticky-col sticky-idx" style={{ color: 'var(--text-4)', ...mono, fontSize: 11 }}>{i + 1}</td>
	                      <td className="sticky-col sticky-mpn"><span className="mono" style={{ fontSize: 12, fontWeight: 500 }}>{r.mpn}</span></td>
	                      <td className="sticky-col sticky-qty" style={{ textAlign: 'center', ...mono }}>{r.qty.toLocaleString()}</td>
	                      <td className="sticky-col sticky-best" style={{ textAlign: 'center' }}><span style={{ fontSize: 12 }}>{summary.supplier}</span></td>
	                      <td className="sticky-col sticky-fulfill" style={{ textAlign: 'center' }}><span style={{ fontSize: 12, color: summary.fulfillment === '部分滿足' ? 'var(--warn)' : 'var(--accent)' }}>{summary.fulfillment}</span></td>
	                      <SupplierCell s={r.digikey} qty={r.qty} name="DK" />
	                      <SupplierCell s={r.mouserHk} qty={r.qty} name="HK" />
	                      <SupplierCell s={r.mouserVn} qty={r.qty} name="VN" />
                          </>
                        );
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Format guide */}
        <div className="card" style={{ marginTop: 28 }}>
          <div className="card-hd">
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Excel 格式說明</h3>
          </div>
          <div className="card-bd" style={{ fontSize: 13, color: 'var(--text-2)' }}>
            <p style={{ margin: '0 0 12px' }}>系統會自動偵測欄位名稱，支援以下關鍵字（不分大小寫）：</p>
            <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 500 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 12px 6px 0', color: 'var(--text-3)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>欄位</th>
                  <th style={{ textAlign: 'left', padding: '6px 12px', color: 'var(--text-3)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>可辨識的標題</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '8px 12px 8px 0', borderBottom: '1px solid var(--hairline)' }}>料號 <span style={{ color: 'var(--danger)' }}>*必填</span></td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--hairline)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>Part Number、MPN、料號</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 12px 8px 0' }}>數量</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>Quantity、Qty、數量、PCS、Demand、Shortage、需求、需求量（Shortage 負數會轉為需求數量）</td>
                </tr>
              </tbody>
            </table>
            <p style={{ margin: '16px 0 0', fontSize: 12, color: 'var(--text-4)' }}>
              單價依採購數量自動選最優階梯價；需求量 ≥ MPQ 時自動拆分整包 + 散料報價（TR/MPQ 整包 + CT/MOQ 餘量）。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
