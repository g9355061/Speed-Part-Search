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
  productUrl: string;
  leadTimeDays?: number | null;
  availabilityStatus?: string | null;
  lastUpdated: string;
}

export interface SearchOptions {
  partNumber: string;
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
