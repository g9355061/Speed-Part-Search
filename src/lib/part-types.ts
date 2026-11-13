export interface PartInfo {
  mpn: string;
  manufacturer: string;
  description: string;
  category?: string;
  lifecycle?: string;
  rohsStatus?: string;
  datasheetUrl?: string;
  primaryProductUrl?: string;
  supplierPartNumber?: string;
}

export interface PriceBreak {
  qty: number;
  price: number;
}

export interface MarketplaceInfo {
  supplierName: string;
  stockQty: number;
  minQty: number;
}

export interface Supplier {
  id: string;
  name: string;
  region: string;
  status?: 'available' | 'restricted' | 'notfound' | 'nostock';
  supplierPartNumber?: string;
  stock: number;
  moq: number;
  mpq?: number;
  packageTypes?: string[];
  leadTime: string;
  leadDays: number;
  unitPrice: number;
  currency: string;
  updated: string;
  updatedSec: number;
  breaks: PriceBreak[];
  /** 第二幣別參考價（目前只有 DigiKey 有）。純顯示，不參與排序與最低價比較 */
  altBreaks?: PriceBreak[];
  altCurrency?: string;
  productUrl?: string;
  datasheetUrl?: string;
  lifecycleStatus?: string;
  isLive?: boolean;
  errorMsg?: string;
  marketplaceVariations?: MarketplaceInfo[];
}

export const priceAtQty = (s: Supplier, qty: number): number => {
  if (s.status === 'restricted' || !s.breaks.length) return Number.POSITIVE_INFINITY;
  if (s.stock <= 0) return Number.POSITIVE_INFINITY;
  const effectiveQty = qty > s.stock ? s.stock : qty;
  let last = s.breaks[0].price;
  for (const b of s.breaks) if (effectiveQty >= b.qty) last = b.price;
  return last;
};
