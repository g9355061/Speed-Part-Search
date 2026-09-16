/**
 * 簡單測試（無框架）：以 mock fetch 驗證 token 快取與錯誤處理。
 * 執行：npm test
 */
import assert from 'node:assert/strict';
import { _resetDigiKeyTokenCache, getDigiKeyAccessToken } from '../src/lib/suppliers/digikey/token';
import { digikeyAdapter } from '../src/lib/suppliers/digikey';
import { SupplierError } from '../src/lib/suppliers/types';

type FetchMock = (url: string, init?: RequestInit) => Promise<Response>;
function setFetch(fn: FetchMock) {
  (globalThis as any).fetch = fn;
}

process.env.DIGIKEY_CLIENT_ID = 'test_id';
process.env.DIGIKEY_CLIENT_SECRET = 'test_secret';
process.env.DIGIKEY_ENV = 'sandbox';

async function testTokenCache() {
  _resetDigiKeyTokenCache();
  let calls = 0;
  setFetch(async () => {
    calls++;
    return new Response(
      JSON.stringify({ access_token: 'tok_abc', expires_in: 600, token_type: 'Bearer' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  });
  const t1 = await getDigiKeyAccessToken();
  const t2 = await getDigiKeyAccessToken();
  assert.equal(t1, 'tok_abc');
  assert.equal(t2, 'tok_abc');
  assert.equal(calls, 1, 'token should be cached and only fetched once');
  console.log('✓ token cache reuses access_token');
}

async function testAuthFailure() {
  _resetDigiKeyTokenCache();
  setFetch(async () =>
    new Response('invalid_client', { status: 401 })
  );
  await assert.rejects(
    () => getDigiKeyAccessToken(),
    (e: unknown) => e instanceof SupplierError && e.code === 'AUTH_FAILED'
  );
  console.log('✓ auth failure surfaces SupplierError(AUTH_FAILED)');
}

async function testEmptyResultMapping() {
  _resetDigiKeyTokenCache();
  let step = 0;
  setFetch(async () => {
    step++;
    if (step === 1) {
      return new Response(
        JSON.stringify({ access_token: 'tok', expires_in: 600 }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({ Products: [], ProductsCount: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  await assert.rejects(
    () => digikeyAdapter.search({ partNumber: 'NONEXISTENT' }),
    (e: unknown) => e instanceof SupplierError && e.code === 'EMPTY_RESULT'
  );
  console.log('✓ empty product list -> SupplierError(EMPTY_RESULT)');
}

async function testProductMapping() {
  _resetDigiKeyTokenCache();
  let step = 0;
  setFetch(async () => {
    step++;
    if (step === 1) {
      return new Response(
        JSON.stringify({ access_token: 'tok', expires_in: 600 }),
        { status: 200 }
      );
    }
    const body = {
      Products: [
        {
          ManufacturerProductNumber: 'NE555P',
          Manufacturer: { Name: 'Texas Instruments' },
          Description: { ProductDescription: 'IC OSC SINGLE TIMER 100KHZ 8-PDIP' },
          QuantityAvailable: 12345,
          UnitPrice: 0.42,
          ProductUrl: '/en/products/detail/texas-instruments/NE555P/12345',
          ProductStatus: { Status: 'Active' },
          ManufacturerLeadWeeks: '6',
          ProductVariations: [
            {
              DigiKeyProductNumber: '296-1411-5-ND',
              QuantityAvailableforPackageType: 12345,
              StandardPricing: [
                { BreakQuantity: 1, UnitPrice: 0.42 },
                { BreakQuantity: 10, UnitPrice: 0.35 },
                { BreakQuantity: 100, UnitPrice: 0.28 },
              ],
            },
          ],
        },
      ],
    };
    return new Response(JSON.stringify(body), { status: 200 });
  });

  const results = await digikeyAdapter.search({ partNumber: 'NE555P' });
  assert.equal(results.length, 1);
  // 沒帶 includeAltCurrency 就只能打一次 search（缺料預測與名單查驗靠這個不燒雙倍配額）
  assert.equal(step, 2, 'default search should issue exactly one product query');
  assert.equal(results[0].altPricing, undefined);
  const r = results[0];
  assert.equal(r.supplier, 'DigiKey');
  assert.equal(r.manufacturerPartNumber, 'NE555P');
  assert.equal(r.supplierPartNumber, '296-1411-5-ND');
  assert.equal(r.manufacturer, 'Texas Instruments');
  assert.equal(r.quantityAvailable, 12345);
  assert.equal(r.unitPrice, 0.42);
  assert.equal(r.priceBreaks.length, 3);
  assert.equal(r.leadTimeDays, 42);
  assert.ok(r.productUrl.startsWith('https://www.digikey.com/'));
  console.log('✓ DigiKey product mapping correct');
}

const DK_PRODUCT_BODY = (unitPrice: number, breaks: [number, number][]) => ({
  Products: [
    {
      ManufacturerProductNumber: 'NE555P',
      Manufacturer: { Name: 'Texas Instruments' },
      Description: { ProductDescription: 'IC OSC SINGLE TIMER 100KHZ 8-PDIP' },
      QuantityAvailable: 12345,
      UnitPrice: unitPrice,
      ProductUrl: '/en/products/detail/texas-instruments/NE555P/12345',
      ProductStatus: { Status: 'Active' },
      ManufacturerLeadWeeks: '6',
      ProductVariations: [
        {
          DigiKeyProductNumber: '296-1411-5-ND',
          QuantityAvailableforPackageType: 12345,
          StandardPricing: breaks.map(([BreakQuantity, UnitPrice]) => ({ BreakQuantity, UnitPrice })),
        },
      ],
    },
  ],
});

function localeOf(init?: RequestInit): { site: string; currency: string } {
  const h = (init?.headers ?? {}) as Record<string, string>;
  return { site: h['X-DIGIKEY-Locale-Site'], currency: h['X-DIGIKEY-Locale-Currency'] };
}

async function testAltCurrencyPricing() {
  _resetDigiKeyTokenCache();
  process.env.DIGIKEY_LOCALE_SITE = 'US';
  process.env.DIGIKEY_LOCALE_CURRENCY = 'USD';
  process.env.DIGIKEY_ALT_LOCALE_SITE = 'CN';
  process.env.DIGIKEY_ALT_LOCALE_CURRENCY = 'CNY';

  const seen: { site: string; currency: string }[] = [];
  setFetch(async (url, init) => {
    if (!url.includes('/products/v4/search/keyword')) {
      return new Response(JSON.stringify({ access_token: 'tok', expires_in: 600 }), { status: 200 });
    }
    const loc = localeOf(init);
    seen.push(loc);
    const body =
      loc.currency === 'CNY'
        ? DK_PRODUCT_BODY(3.5, [[1, 3.5], [10, 2.9], [100, 2.32]])
        : DK_PRODUCT_BODY(0.42, [[1, 0.42], [10, 0.35], [100, 0.28]]);
    return new Response(JSON.stringify(body), { status: 200 });
  });

  const results = await digikeyAdapter.search({ partNumber: 'NE555P', includeAltCurrency: true });
  assert.equal(seen.length, 2, 'should query twice, one per currency');
  assert.deepEqual(seen[0], { site: 'US', currency: 'USD' });
  assert.deepEqual(seen[1], { site: 'CN', currency: 'CNY' });

  const r = results[0];
  // 主結果仍是 USD，人民幣只掛在 altPricing，不覆蓋原欄位
  assert.equal(r.currency, 'USD');
  assert.equal(r.unitPrice, 0.42);
  assert.equal(r.priceBreaks[0].currency, 'USD');
  assert.ok(r.altPricing, 'altPricing should be attached');
  assert.equal(r.altPricing!.currency, 'CNY');
  assert.equal(r.altPricing!.localeSite, 'CN');
  assert.equal(r.altPricing!.unitPrice, 3.5);
  assert.equal(r.altPricing!.priceBreaks.length, 3);
  assert.equal(r.altPricing!.priceBreaks[2].unitPrice, 2.32);
  assert.equal(r.altPricing!.priceBreaks[2].currency, 'CNY');
  console.log('✓ dual-currency search attaches altPricing without touching primary');
}

async function testAltCurrencyFailureIsSoft() {
  _resetDigiKeyTokenCache();
  let searchCalls = 0;
  setFetch(async (url) => {
    if (!url.includes('/products/v4/search/keyword')) {
      return new Response(JSON.stringify({ access_token: 'tok', expires_in: 600 }), { status: 200 });
    }
    searchCalls++;
    // 第二次（人民幣）失敗：CN 站有料件限制，查無是常態
    if (searchCalls === 2) return new Response('boom', { status: 500 });
    return new Response(JSON.stringify(DK_PRODUCT_BODY(0.42, [[1, 0.42]])), { status: 200 });
  });

  const results = await digikeyAdapter.search({ partNumber: 'NE555P', includeAltCurrency: true });
  assert.equal(searchCalls, 2);
  assert.equal(results.length, 1, 'primary result must survive an alt-currency failure');
  assert.equal(results[0].unitPrice, 0.42);
  assert.equal(results[0].altPricing, undefined);
  console.log('✓ alt-currency failure leaves the primary result intact');
}

async function testRateLimit() {
  _resetDigiKeyTokenCache();
  let step = 0;
  setFetch(async () => {
    step++;
    if (step === 1) {
      return new Response(
        JSON.stringify({ access_token: 'tok', expires_in: 600 }),
        { status: 200 }
      );
    }
    return new Response('rate limited', { status: 429 });
  });
  await assert.rejects(
    () => digikeyAdapter.search({ partNumber: 'X' }),
    (e: unknown) => e instanceof SupplierError && e.code === 'RATE_LIMITED'
  );
  console.log('✓ 429 -> SupplierError(RATE_LIMITED)');
}

(async () => {
  await testTokenCache();
  await testAuthFailure();
  await testEmptyResultMapping();
  await testProductMapping();
  await testAltCurrencyPricing();
  await testAltCurrencyFailureIsSoft();
  await testRateLimit();
  console.log('\nAll tests passed.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
