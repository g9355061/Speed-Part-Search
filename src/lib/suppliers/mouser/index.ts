import { PackagingVariation, PartResult, PriceBreak, SearchOptions, SupplierAdapter, SupplierError } from '../types';

const BASE_URL = 'https://api.mouser.com/api/v1';
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const DEFAULT_MIN_INTERVAL_MS = 2100; // ~28 req/min, still below Mouser's observed ~30 req/min ceiling.
const US_SUPPLIER = 'Mouser';
const HK_SUPPLIER = 'Mouser HK';
const VN_SUPPLIER = 'Mouser VN';

/* ── Raw API types ── */
interface MouserPriceBreak {
  Quantity: number;
  Price: string;     // e.g. "$0.4700"
  Currency: string;
}

interface MouserProductAttribute {
  AttributeName?: string;
  AttributeValue?: string;
}

interface MouserPart {
  MouserPartNumber?: string;
  ManufacturerPartNumber?: string;
  Manufacturer?: string;
  Description?: string;
  Availability?: string;          // e.g. "15,000 In Stock"
  UnitPrice?: string;             // e.g. "$0.4700"
  PriceBreaks?: MouserPriceBreak[];
  ProductDetailUrl?: string;
  LeadTime?: string;
  Min?: string;                   // MOQ as string
  MultOrder?: string;
  Mult?: string;                  // step quantity
  ProductAttributes?: MouserProductAttribute[];
  RestrictionMessage?: string;    // 廠商限制訊息（非授權經銷商）
  LifecycleStatus?: string;       // e.g. "New Product", "End of Life", "Not Recommended for New Designs", "Obsolete"
}

interface MouserSearchResponse {
  Errors?: Array<{ Id: number; Code: string; Message: string }>;
  SearchResults?: {
    NumberOfResult: number;
    Parts: MouserPart[];
  };
}

/* ── Helpers ── */
function parsePrice(s?: string): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizePartNumber(value?: string): string {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function parseStock(s?: string): number {
  if (!s) return 0;
  const m = s.replace(/,/g, '').match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

function parseLeadDays(s?: string): number | null {
  if (!s) return null;
  if (/in stock/i.test(s)) return 0;
  const w = s.match(/(\d+)\s*week/i);
  if (w) return parseInt(w[1], 10) * 7;
  const d = s.match(/(\d+)\s*day/i);
  if (d) return parseInt(d[1], 10);
  return null;
}

function parseStandardPackQty(attrs?: MouserProductAttribute[]): number | null {
  if (!attrs) return null;
  const attr = attrs.find((a) =>
    /^(Standard Pack Qty|標準包裝數量)$/i.test(a.AttributeName?.trim() ?? '')
  );
  if (!attr?.AttributeValue) return null;
  const n = parseInt(attr.AttributeValue.replace(/,/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function mapPart(p: MouserPart, currency: string, supplier: string): PartResult {
  const priceBreaks: PriceBreak[] = (p.PriceBreaks ?? [])
    .map((b) => ({ quantity: b.Quantity, unitPrice: parsePrice(b.Price) ?? 0, currency: b.Currency || currency }))
    .filter((b) => b.unitPrice > 0);

  const stock = parseStock(p.Availability);
  const unitPrice = parsePrice(p.UnitPrice) ?? priceBreaks[0]?.unitPrice ?? null;

  // 建立 variations：MOQ (CT) + MPQ (TR) — 共用相同 price breaks
  const moq = parseInt(p.Min ?? '1', 10) || 1;
  const mpq = parseStandardPackQty(p.ProductAttributes);
  const variations: PackagingVariation[] = priceBreaks.length
    ? [
        ...(mpq && mpq > moq
          ? [{ packageType: 'TR' as const, minQty: mpq, breaks: priceBreaks }]
          : []),
        { packageType: 'CT' as const, minQty: moq, breaks: priceBreaks },
      ]
    : [];

  return {
    supplier,
    manufacturerPartNumber: p.ManufacturerPartNumber ?? '',
    supplierPartNumber: p.MouserPartNumber ?? '',
    manufacturer: p.Manufacturer ?? '',
    description: p.Description ?? '',
    quantityAvailable: stock,
    unitPrice,
    currency,
    priceBreaks,
    variations: variations.length ? variations : undefined,
    productUrl: p.ProductDetailUrl
      ? p.ProductDetailUrl.startsWith('http')
        ? p.ProductDetailUrl
        : `https://www.mouser.com${p.ProductDetailUrl}`
      : '',
    leadTimeDays: parseLeadDays(p.LeadTime),
    availabilityStatus: p.LifecycleStatus || (stock > 0 ? 'In Stock' : 'Out of Stock'),
    lifecycleStatus: p.LifecycleStatus || null,
    lastUpdated: new Date().toISOString(),
  };
}

function minIntervalMs(): number {
  const raw = process.env.MOUSER_MIN_INTERVAL_MS;
  const parsed = raw ? parseInt(raw, 10) : DEFAULT_MIN_INTERVAL_MS;
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : DEFAULT_MIN_INTERVAL_MS;
}

/* ── Short-lived cache + in-flight de-dupe ── */
type CacheEntry =
  | { expiresAt: number; results: PartResult[]; error?: never }
  | { expiresAt: number; results?: never; error: SupplierError };

function cacheKey(partNumber: string): string {
  return partNumber.trim().toLowerCase();
}

function cloneSupplierError(error: SupplierError): SupplierError {
  return new SupplierError(error.supplier, error.code, error.message, error.status);
}

function isCacheableError(error: SupplierError): boolean {
  return error.code === 'EMPTY_RESULT' || error.code === 'RESTRICTED' || error.code === 'NOT_FOUND';
}

function remember(cache: Map<string, CacheEntry>, key: string, entry: CacheEntry): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, entry);
}


function createMouserAdapter(name: string, envKey: string): SupplierAdapter {
  let nextAllowed = 0;
  const cache = new Map<string, CacheEntry>();
  const inflight = new Map<string, Promise<PartResult[]>>();

  async function throttle(): Promise<void> {
    const now = Date.now();
    const wait = nextAllowed - now;
    nextAllowed = Math.max(now, nextAllowed) + minIntervalMs();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }

  async function searchUncached(opts: SearchOptions): Promise<PartResult[]> {
    await throttle();
    const apiKey = process.env[envKey];
    if (!apiKey) {
      throw new SupplierError(name, 'CONFIG_MISSING', `Missing ${envKey} in environment`);
    }

    const url = `${BASE_URL}/search/partnumber?apiKey=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        SearchByPartRequest: { mouserPartNumber: opts.partNumber, partSearchOptions: '' },
      }),
      cache: 'no-store',
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      if (
        resp.status === 429 ||
        resp.status === 503 ||
        /TooManyRequests|MaxCallPerDay|Maximum calls per day exceeded|rate limit/i.test(text)
      ) {
        throw new SupplierError(
          name,
          'RATE_LIMITED',
          `${name} API limit exceeded (${resp.status}): ${text.slice(0, 200)}`,
          resp.status
        );
      }
      if (resp.status === 401 || resp.status === 403) {
        throw new SupplierError(name, 'AUTH_FAILED', `${name} rejected API key (${resp.status}): ${text.slice(0, 200)}`);
      }
      throw new SupplierError(name, 'UPSTREAM_ERROR', `${name} search failed (${resp.status}): ${text.slice(0, 200)}`);
    }

    const data = (await resp.json()) as MouserSearchResponse;

    if (data.Errors?.length) {
      const e = data.Errors[0];
      throw new SupplierError(name, 'UPSTREAM_ERROR', `${name} error: ${e.Message}`);
    }

    const targetPartNumber = normalizePartNumber(opts.partNumber);
    const apiParts = data.SearchResults?.Parts ?? [];
    const exactParts = apiParts.filter(
      (p) => normalizePartNumber(p.ManufacturerPartNumber) === targetPartNumber
    );
    const suffixParts = exactParts.length
      ? []
      : apiParts.filter((p) => {
          const apiMpn = normalizePartNumber(p.ManufacturerPartNumber);
          return apiMpn.startsWith(targetPartNumber) && apiMpn !== targetPartNumber;
        });
    const allParts = exactParts.length ? exactParts : suffixParts;

    if (!allParts.length) {
      throw new SupplierError(name, 'EMPTY_RESULT', `No results for "${opts.partNumber}" on ${name}`);
    }

    const parts = allParts.filter((p) => !p.RestrictionMessage);
    if (!parts.length) {
      throw new SupplierError(name, 'RESTRICTED', `"${opts.partNumber}" restricted on ${name} (distributor purchase not available)`);
    }

    const currency = parts[0]?.PriceBreaks?.[0]?.Currency ?? 'USD';
    return [mapPart(parts[0], currency, name)];
  }

  async function search(opts: SearchOptions): Promise<PartResult[]> {
    const key = cacheKey(opts.partNumber);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      if (cached.error) throw cloneSupplierError(cached.error);
      return cached.results;
    }
    if (cached) cache.delete(key);

    const pending = inflight.get(key);
    if (pending) return pending;

    const promise = searchUncached(opts)
      .then((results) => {
        remember(cache, key, { expiresAt: Date.now() + CACHE_TTL_MS, results });
        return results;
      })
      .catch((error) => {
        if (error instanceof SupplierError && isCacheableError(error)) {
          remember(cache, key, { expiresAt: Date.now() + CACHE_TTL_MS, error: cloneSupplierError(error) });
        }
        throw error;
      })
      .finally(() => {
        inflight.delete(key);
      });

    inflight.set(key, promise);
    return promise;
  }

  return { name, search };
}

export const mouserAdapter = createMouserAdapter(US_SUPPLIER, 'MOUSER_API_KEY');
export const mouserHkAdapter = createMouserAdapter(HK_SUPPLIER, 'MOUSER_HK_API_KEY');
export const mouserVnAdapter = createMouserAdapter(VN_SUPPLIER, 'MOUSER_VN_API_KEY');
