export interface PriceBreak {
  quantity: number;
  unitPrice: number;
  currency: string;
}

export interface PackagingVariation {
  packageType: 'TR' | 'CT' | 'DKR' | 'OTHER';
  minQty: number;
  breaks: PriceBreak[];
}

export interface MarketplaceVariation {
  supplierName: string;
  stockQty: number;
  minQty: number;
  breaks: PriceBreak[];
}

/** 同一顆料以第二種幣別（DigiKey 另一個站別）再查一次得到的報價，純顯示用，不參與比價排序 */
export interface AltCurrencyPricing {
  currency: string;
  localeSite: string;
  unitPrice: number | null;
  priceBreaks: PriceBreak[];
}

export interface PartResult {
  supplier: string;
  manufacturerPartNumber: string;
  supplierPartNumber: string;
  manufacturer: string;
  description: string;
  quantityAvailable: number;
  unitPrice: number | null;
  currency: string;
  priceBreaks: PriceBreak[];
  variations?: PackagingVariation[];
  marketplaceVariations?: MarketplaceVariation[];
  altPricing?: AltCurrencyPricing;
  productUrl: string;
  leadTimeDays?: number | null;
  availabilityStatus?: string | null;
  lifecycleStatus?: string | null;
  lastUpdated: string;
}

export interface SearchOptions {
  partNumber: string;
  /**
   * 額外以第二種幣別再查一次（目前只有 DigiKey 支援，結果放在 altPricing）。
   * 只有 /api/search（人在看價格）會開；缺料預測與名單查驗維持單幣別，
   * 免得燒配額，也免得人民幣價進到只認 USD 的風險規則。
   */
  includeAltCurrency?: boolean;
}

export interface SupplierAdapter {
  readonly name: string;
  search(opts: SearchOptions): Promise<PartResult[]>;
}

export class SupplierError extends Error {
  constructor(
    public supplier: string,
    public code:
      | 'AUTH_FAILED'
      | 'NOT_FOUND'
      | 'RATE_LIMITED'
      | 'UPSTREAM_ERROR'
      | 'CONFIG_MISSING'
      | 'EMPTY_RESULT'
      | 'RESTRICTED',
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = 'SupplierError';
  }
}
