// QQ 詢價的純函式工具（回覆解析、報價新鮮度、最佳報價挑選）。
// 2026-07-19 自 qq-inquiry/page.tsx 抽出：無任何 React/DB 依賴，可直接進 npm test
// 以純函式驗證，不必每次改動都在登入牆後手動貼回覆驗十個案例。

const DAY_MS = 86400000;

/** 報價比較所需的最小欄位集合；page.tsx 的 QuoteRecord 為其超集（結構相容）。 */
export interface QuoteLike {
  unitPrice: string;
  stock: string;
  moq: string;
  leadTime: string;
  quotedAt: string;
  validUntil: string | null;
}

// 廠商明講的有效期（「報價有效期 3 天」）→ 硬期限 valid_until；沒講就 null，由前端用報價日推新鮮度
export function computeValidUntil(validityText: string, from: Date): string | null {
  const m = validityText.match(/([0-9]+)\s*([天日周週月])/);
  if (!m) return null;
  const n = Number(m[1]);
  const days = m[2] === '月' ? n * 30 : m[2] === '周' || m[2] === '週' ? n * 7 : n;
  return new Date(from.getTime() + days * DAY_MS).toISOString();
}

// 兩層有效期：廠商明講的 valid_until 過期＝硬過期；否則依報價日齡分級（7 天內有效、7-14 天可能失效、14 天以上僅供參考）
export function quoteFreshness(
  quote: Pick<QuoteLike, 'quotedAt' | 'validUntil'>,
): { label: string; cls: 'fresh' | 'aging' | 'stale' | 'expired' } {
  const now = Date.now();
  if (quote.validUntil) {
    const until = Date.parse(quote.validUntil);
    if (!Number.isNaN(until)) {
      if (now > until) return { label: '已過期', cls: 'expired' };
      return { label: `效期至 ${new Date(until).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}`, cls: 'fresh' };
    }
  }
  const at = Date.parse(quote.quotedAt);
  const ageDays = Number.isNaN(at) ? 0 : (now - at) / DAY_MS;
  if (ageDays > 14) return { label: '僅供參考', cls: 'stale' };
  if (ageDays > 7) return { label: '可能失效', cls: 'aging' };
  return { label: '有效', cls: 'fresh' };
}

export function parseReplyText(text: string) {
  // 標籤式（單價：0.112 含稅）與華強報價行式（DMP21D5UFB4-7B 2649pcs 0.2含税 DIODES(美台) 21+）都支援
  // QQ 精簡回覆「40 25+」：第一個數字=單價、YY+=年份批號。只認「數字 空白 兩位數+」這個精確組合，
  // 且收緊兩道防線避免誤判：(1) 該數字前若被 庫存/現貨/MOQ/數量 標籤帶出，視為庫存量不當單價；
  // (2) 單價需「有小數點，或整數 < 1000」，大額整數多為庫存量，寧可顯示待確認也不報錯價。
  const terseQqPrice = (() => {
    const m = text.match(/(?:^|[\s，,])([0-9]+(?:\.[0-9]+)?)\s+[0-9]{2}\+(?=\s|$)/m);
    if (!m || m.index == null) return undefined;
    const before = text.slice(0, m.index);
    if (/(?:庫存|库存|現貨|现货|MOQ|起訂|起订|數量|数量)\D*$/i.test(before)) return undefined;
    if (!m[1].includes('.') && Number(m[1]) >= 1000) return undefined;
    return m[1];
  })();
  const price =
    text.match(/(?:單價|价格|價格|含稅|含税|RMB|￥|¥)\s*[:：]?\s*(?:RMB|￥|¥)?\s*([0-9]+(?:\.[0-9]+)?)/i)?.[1] ??
    text.match(/(?:^|[\s,，])([0-9]+(?:\.[0-9]+)?)\s*(?:元)?\s*含[税稅]/m)?.[1] ??
    terseQqPrice;
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

export function cleanSupplierReply(text: string) {
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

export function quoteValueNumber(value: string): number | string {
  const n = Number(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && value !== '待確認' ? n : '';
}

export function quoteValueNumeric(value: string): number | null {
  const n = Number(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && value !== '待確認' ? n : null;
}

export function leadTimeScore(value: string) {
  if (/今天|現貨|现货/i.test(value)) return 0;
  if (/明天/i.test(value)) return 1;
  const days = value.match(/([0-9]+)\s*天/)?.[1];
  if (days) return Number(days);
  return 99;
}

function quoteTaxIncluded(quote: QuoteLike) {
  return /含[税稅]/.test(quote.unitPrice);
}

export function quoteScore(quote: QuoteLike, demandQty: number) {
  const price = quoteValueNumeric(quote.unitPrice);
  const stock = quoteValueNumeric(quote.stock);
  const moq = quoteValueNumeric(quote.moq);
  const hasPrice = price !== null;
  const stockOk = stock !== null && stock >= demandQty;
  const moqOk = moq === null || moq <= demandQty;
  const freshness = quoteFreshness(quote);
  return [
    freshness.cls === 'expired' ? 1 : 0,
    freshness.cls === 'stale' ? 1 : 0,
    hasPrice ? 0 : 1,
    stockOk ? 0 : 1,
    moqOk ? 0 : 1,
    price ?? Number.MAX_SAFE_INTEGER,
    leadTimeScore(quote.leadTime),
    -(quoteValueNumeric(quote.stock) ?? 0),
  ];
}

export function compareQuote(a: QuoteLike, b: QuoteLike, demandQty: number) {
  const scoreA = quoteScore(a, demandQty);
  const scoreB = quoteScore(b, demandQty);
  for (let i = 0; i < scoreA.length; i++) {
    if (scoreA[i] !== scoreB[i]) return scoreA[i] - scoreB[i];
  }
  return 0;
}

export function pickBestQuote<T extends QuoteLike>(quotes: T[], demandQty: number): T | null {
  return [...quotes].sort((a, b) => compareQuote(a, b, demandQty))[0] ?? null;
}

export function bestQuoteReason(quote: QuoteLike | null, candidates: QuoteLike[], demandQty: number) {
  if (!quote) return '';
  const stock = quoteValueNumeric(quote.stock);
  const moq = quoteValueNumeric(quote.moq);
  const checks = [
    quoteValueNumeric(quote.unitPrice) !== null ? '有單價' : '單價待確認',
    stock !== null && stock >= demandQty ? '庫存足夠' : '庫存需確認',
    moq === null || moq <= demandQty ? 'MOQ符合' : 'MOQ高於需求',
  ];
  const freshness = quoteFreshness(quote);
  if (freshness.cls === 'expired' || freshness.cls === 'stale') {
    checks.push(freshness.cls === 'expired' ? '⚠ 報價已過期' : '⚠ 報價超過14天僅供參考');
  }
  // 含稅/未稅混雜時價格排序不可比（含稅 0.2 會被誤判輸給未稅 0.19），明示請人工確認
  const priced = candidates.filter((c) => quoteValueNumeric(c.unitPrice) !== null);
  const taxKinds = new Set(priced.map((c) => quoteTaxIncluded(c)));
  if (taxKinds.size > 1) {
    checks.push('⚠ 候選報價含稅/未稅混雜，價格排序僅供參考');
  }
  return `自動從 ${candidates.length} 筆報價挑選：${checks.join('、')}`;
}
