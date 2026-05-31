import {
  MarketplaceVariation,
  PackagingVariation,
  PartResult,
  PriceBreak,
  SearchOptions,
  SupplierAdapter,
  SupplierError,
} from '../types';
import { getDigiKeyAccessToken, getDigiKeyBaseUrl } from './token';

const SUPPLIER = 'DigiKey';

interface DKPriceBreak {
  BreakQuantity: number;
  UnitPrice: number;
  TotalPrice?: number;
}

interface DKVariation {
  DigiKeyProductNumber?: string;
  QuantityAvailableforPackageType?: number;
  MinimumOrderQuantity?: number;
  StandardPricing?: DKPriceBreak[];
  MarketPlace?: boolean;
  Supplier?: { Id?: number; Name?: string };
}

interface DKProduct {
  Description?: { ProductDescription?: string; DetailedDescription?: string };
  Manufacturer?: { Name?: string };
  ManufacturerProductNumber?: string;
  ProductUrl?: string;
  QuantityAvailable?: number;
  UnitPrice?: number;
  ProductVariations?: DKVariation[];
  ProductStatus?: { Status?: string };
  ManufacturerLeadWeeks?: string;
}

interface DKSearchResponse {
  Products?: DKProduct[];
  ProductsCount?: number;
  ExactMatches?: DKProduct[];
}

// Pick the variation with the lowest MOQ (e.g. CT over TR/Digi-Reel)
function pickBestVariation(p: DKProduct): DKVariation | undefined {
  const vars = p.ProductVariations;
  if (!vars?.length) return undefined;
  return vars.reduce((best, v) => {
    const bestMoq = best.MinimumOrderQuantity ?? best.StandardPricing?.[0]?.BreakQuantity ?? Infinity;
    const vMoq    = v.MinimumOrderQuantity    ?? v.StandardPricing?.[0]?.BreakQuantity    ?? Infinity;
    return vMoq < bestMoq ? v : best;
  });
}

function pickProductNumber(p: DKProduct): string {
  return pickBestVariation(p)?.DigiKeyProductNumber ?? '';
}

function pickPriceBreaks(p: DKProduct, currency: string): PriceBreak[] {
  // Merge all variations: at each break quantity, keep the lowest unit price.
  // This lets the caller pick the cheapest option regardless of packaging type.
  const best = new Map<number, number>();
  for (const v of p.ProductVariations ?? []) {
    for (const b of v.StandardPricing ?? []) {
      const existing = best.get(b.BreakQuantity);
      if (existing == null || b.UnitPrice < existing) best.set(b.BreakQuantity, b.UnitPrice);
    }
  }
  return Array.from(best.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([quantity, unitPrice]) => ({ quantity, unitPrice, currency }));
}

function leadWeeksToDays(weeks?: string): number | null {
  if (!weeks) return null;
  const n = parseInt(weeks, 10);
  return Number.isFinite(n) ? n * 7 : null;
}

function detectPackageType(pn: string): PackagingVariation['packageType'] {
  const upper = pn.toUpperCase();
  if (upper.endsWith('TR-ND') || upper.endsWith('TR')) return 'TR';
  if (upper.endsWith('CT-ND') || upper.endsWith('CT')) return 'CT';
  if (upper.endsWith('DKR-ND') || upper.endsWith('DKR')) return 'DKR';
  return 'OTHER';
}

function buildVariations(p: DKProduct, currency: string): PackagingVariation[] {
  return (p.ProductVariations ?? [])
    .filter((v) => v.StandardPricing?.length)
    .map((v) => ({
      packageType: detectPackageType(v.DigiKeyProductNumber ?? ''),
      minQty: v.MinimumOrderQuantity ?? v.StandardPricing![0].BreakQuantity,
      breaks: v.StandardPricing!.map((b) => ({
        quantity: b.BreakQuantity,
        unitPrice: b.UnitPrice,
        currency,
      })),
    }));
}

function buildMarketplaceVariations(p: DKProduct, currency: string): MarketplaceVariation[] {
  return (p.ProductVariations ?? [])
    .filter((v) => v.MarketPlace === true && v.StandardPricing?.length)
    .map((v) => ({
      supplierName: v.Supplier?.Name ?? 'Marketplace',
      stockQty: v.QuantityAvailableforPackageType ?? 0,
      minQty: v.MinimumOrderQuantity ?? v.StandardPricing![0].BreakQuantity,
      breaks: v.StandardPricing!.map((b) => ({
        quantity: b.BreakQuantity,
        unitPrice: b.UnitPrice,
        currency,
      })),
    }));
}

function mapProduct(p: DKProduct, currency: string): PartResult {
  const priceBreaks = pickPriceBreaks(p, currency);
  const variations = buildVariations(p, currency);
  const marketplaceVariations = buildMarketplaceVariations(p, currency);
  return {
    supplier: SUPPLIER,
    manufacturerPartNumber: p.ManufacturerProductNumber ?? '',
    supplierPartNumber: pickProductNumber(p),
    manufacturer: p.Manufacturer?.Name ?? '',
    description:
      p.Description?.ProductDescription ??
      p.Description?.DetailedDescription ??
      '',
    quantityAvailable:
      p.QuantityAvailable ??
      p.ProductVariations?.[0]?.QuantityAvailableforPackageType ??
      0,
    unitPrice: p.UnitPrice ?? priceBreaks[0]?.unitPrice ?? null,
    currency,
    priceBreaks,
    variations,
    ...(marketplaceVariations.length ? { marketplaceVariations } : {}),
    productUrl: p.ProductUrl
      ? p.ProductUrl.startsWith('http')
        ? p.ProductUrl
        : `https://www.digikey.com${p.ProductUrl}`
      : '',
    leadTimeDays: leadWeeksToDays(p.ManufacturerLeadWeeks),
    availabilityStatus: p.ProductStatus?.Status ?? null,
    lifecycleStatus: p.ProductStatus?.Status ?? null,
    lastUpdated: new Date().toISOString(),
  };
}

/* ── Server-side rate limiter (max 30 req/min → 2s between calls) ── */
let _dkNextAllowed = 0;
async function throttleDK(): Promise<void> {
  const now = Date.now();
  const wait = _dkNextAllowed - now;
  _dkNextAllowed = Math.max(now, _dkNextAllowed) + 2000;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function searchDigiKey(opts: SearchOptions): Promise<PartResult[]> {
  await throttleDK();
  const token = await getDigiKeyAccessToken();
  const clientId = process.env.DIGIKEY_CLIENT_ID!;
  const site = process.env.DIGIKEY_LOCALE_SITE ?? 'US';
  const language = process.env.DIGIKEY_LOCALE_LANGUAGE ?? 'en';
  const currency = process.env.DIGIKEY_LOCALE_CURRENCY ?? 'USD';

  const url = `${getDigiKeyBaseUrl()}/products/v4/search/keyword`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-DIGIKEY-Client-Id': clientId,
      'X-DIGIKEY-Locale-Site': site,
      'X-DIGIKEY-Locale-Language': language,
      'X-DIGIKEY-Locale-Currency': currency,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      Keywords: opts.partNumber,
      Limit: 10,
      Offset: 0,
    }),
    cache: 'no-store',
  });
  if (resp.status === 401 || resp.status === 403) {
    const errorText = await resp.text().catch(() => '');
    throw new SupplierError(
      SUPPLIER,
      'RATE_LIMITED',
      `DigiKey search is unavailable (${resp.status}). Treating it as a batch limit; daily quota resets at UTC 00:00 / Taiwan 08:00.${errorText ? ` ${errorText.slice(0, 200)}` : ''}`,
      resp.status
    );
  }
  if (resp.status === 429) {
    throw new SupplierError(
      SUPPLIER,
      'RATE_LIMITED',
      'DigiKey search limit exceeded (429). Daily quota resets at UTC 00:00 / Taiwan 08:00.',
      429
    );
  }
  if (resp.status === 404) {
    throw new SupplierError(
      SUPPLIER,
      'NOT_FOUND',
      `Part number "${opts.partNumber}" not found on DigiKey`,
      404
    );
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new SupplierError(
      SUPPLIER,
      'UPSTREAM_ERROR',
      `DigiKey search failed (${resp.status}): ${text.slice(0, 300)}`,
      resp.status
    );
  }

  const data = (await resp.json()) as DKSearchResponse;
  const products = (data.ExactMatches?.length ? data.ExactMatches : data.Products) ?? [];

  if (products.length === 0) {
    throw new SupplierError(
      SUPPLIER,
      'EMPTY_RESULT',
      `No results for "${opts.partNumber}" (sandbox 可能回傳空資料，可改試一些 DigiKey 範例料號，例如 "P5555-ND" 或 production 環境)`
    );
  }

  return products.map((p) => mapProduct(p, currency));
}

export const digikeyAdapter: SupplierAdapter = {
  name: SUPPLIER,
  search: searchDigiKey,
};
