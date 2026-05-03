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
  await testRateLimit();
  console.log('\nAll tests passed.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
