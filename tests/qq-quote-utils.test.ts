/**
 * QQ 詢價純函式測試（無框架，同 digikey.test.ts 模式）。
 * 執行：npm test
 * 涵蓋：回覆解析（含 2026-07-14 收緊的「40 25+」單價防線）、有效期換算、
 * 報價新鮮度分級、最佳報價挑選與含稅/未稅混雜警示。
 */
import assert from 'node:assert/strict';
import {
  parseReplyText,
  computeValidUntil,
  quoteFreshness,
  cleanSupplierReply,
  pickBestQuote,
  bestQuoteReason,
  type QuoteLike,
} from '../src/lib/qq/quote-utils';

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function makeQuote(overrides: Partial<QuoteLike>): QuoteLike {
  return {
    unitPrice: '待確認',
    stock: '待確認',
    moq: '待確認',
    leadTime: '待確認',
    quotedAt: new Date().toISOString(),
    validUntil: null,
    ...overrides,
  };
}

function testParseReplyText() {
  // QQ 精簡回覆：數字＋批號
  assert.equal(parseReplyText('40 25+').price, '￥40');
  assert.equal(parseReplyText('0.112 25+').price, '￥0.112');
  assert.equal(parseReplyText('800 25+').price, '￥800');
  // 防線 1：庫存/現貨標籤帶出的數字不當單價
  assert.equal(parseReplyText('庫存 5000 25+').price, '待確認');
  assert.equal(parseReplyText('现货 3000 24+').price, '待確認');
  // 防線 2：大額整數（≥1000 無小數點）多為庫存量
  assert.equal(parseReplyText('5000 24+').price, '待確認');
  // 華強行式：料號 數量pcs 價格含税 品牌 批號
  const hqew = parseReplyText('DMP21D5UFB4-7B 2649pcs 0.2含税 DIODES(美台) 21+');
  assert.equal(hqew.price, '￥0.2（含稅）');
  assert.equal(hqew.stock, '2649');
  assert.equal(hqew.batch, '21+');
  // 標籤式
  const labeled = parseReplyText('單價：0.35 含稅\n庫存：12,000\nMOQ：3000\n交期：3天\n有效期 3 天');
  assert.equal(labeled.price, '￥0.35（含稅）');
  assert.equal(labeled.stock, '12,000');
  assert.equal(labeled.moq, '3000');
  assert.equal(labeled.validity, '3 天');
  console.log('✓ parseReplyText 10 例（含庫存誤判防線）');
}

function testComputeValidUntil() {
  const from = new Date('2026-07-01T00:00:00Z');
  assert.equal(computeValidUntil('3 天', from), new Date('2026-07-04T00:00:00Z').toISOString());
  assert.equal(computeValidUntil('2 週', from), new Date('2026-07-15T00:00:00Z').toISOString());
  assert.equal(computeValidUntil('1 月', from), new Date('2026-07-31T00:00:00Z').toISOString());
  assert.equal(computeValidUntil('—', from), null);
  console.log('✓ computeValidUntil 天/週/月換算');
}

function testQuoteFreshness() {
  assert.equal(quoteFreshness({ quotedAt: daysAgoIso(1), validUntil: null }).cls, 'fresh');
  assert.equal(quoteFreshness({ quotedAt: daysAgoIso(10), validUntil: null }).cls, 'aging');
  assert.equal(quoteFreshness({ quotedAt: daysAgoIso(20), validUntil: null }).cls, 'stale');
  // 廠商明講效期優先於日齡
  assert.equal(quoteFreshness({ quotedAt: daysAgoIso(20), validUntil: daysAgoIso(-3) }).cls, 'fresh');
  assert.equal(quoteFreshness({ quotedAt: daysAgoIso(1), validUntil: daysAgoIso(1) }).cls, 'expired');
  console.log('✓ quoteFreshness 兩層有效期分級');
}

function testCleanSupplierReply() {
  const mixed = '⭐新客禮包點我領取！\n0.2含税 2649pcs\n了解我们更多请访问官网';
  const cleaned = cleanSupplierReply(mixed);
  assert.ok(cleaned.text.includes('0.2含税'));
  assert.ok(!cleaned.text.includes('新客'));
  assert.equal(cleaned.dropped, 2);
  console.log('✓ cleanSupplierReply 保留報價句、剔除促銷句');
}

function testBestQuoteAndTaxWarning() {
  const cheapNoTax = makeQuote({ unitPrice: '￥0.19', stock: '50000', moq: '1000' });
  const taxedSlightlyHigher = makeQuote({ unitPrice: '￥0.2（含稅）', stock: '50000', moq: '1000' });
  const best = pickBestQuote([cheapNoTax, taxedSlightlyHigher], 5000);
  assert.equal(best, cheapNoTax); // 數字排序仍挑 0.19（不可比，故要出警示）
  const reason = bestQuoteReason(best, [cheapNoTax, taxedSlightlyHigher], 5000);
  assert.ok(reason.includes('含稅/未稅混雜'), `應含混雜警示，實得：${reason}`);
  // 全含稅則不出警示
  const taxedA = makeQuote({ unitPrice: '￥0.2（含稅）', stock: '50000' });
  const taxedB = makeQuote({ unitPrice: '￥0.3（含稅）', stock: '50000' });
  const reason2 = bestQuoteReason(taxedA, [taxedA, taxedB], 5000);
  assert.ok(!reason2.includes('混雜'));
  // 過期報價要被降權
  const expired = makeQuote({ unitPrice: '￥0.1（含稅）', stock: '99999', validUntil: daysAgoIso(1) });
  const fresh = makeQuote({ unitPrice: '￥0.5（含稅）', stock: '99999' });
  assert.equal(pickBestQuote([expired, fresh], 100), fresh);
  console.log('✓ pickBestQuote 降權 + 含稅/未稅混雜警示');
}

testParseReplyText();
testComputeValidUntil();
testQuoteFreshness();
testCleanSupplierReply();
testBestQuoteAndTaxWarning();
console.log('All qq-quote-utils tests passed.');
