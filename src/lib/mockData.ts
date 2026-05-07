export interface PartInfo {
  mpn: string;
  manufacturer: string;
  description: string;
  package: string;
  rohs: boolean;
  lifecycle: string;
  voltage: string;
  tempRange: string;
  flash: string;
  sram: string;
  speed: string;
  io: number;
  category: string;
  datasheet: string;
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
  stock: number;
  moq: number;
  mpq?: number;
  leadTime: string;
  leadDays: number;
  unitPrice: number;
  currency: string;
  updated: string;
  updatedSec: number;
  breaks: PriceBreak[];
  productUrl?: string;
  isLive?: boolean;
  errorMsg?: string;
  marketplaceVariations?: MarketplaceInfo[];
}

export const PART_DATA: PartInfo = {
  mpn: 'STM32F103C8T6',
  manufacturer: 'STMicroelectronics',
  description: 'ARM Cortex-M3 32-bit MCU, 64KB Flash, 20KB SRAM, 72MHz, LQFP-48',
  package: 'LQFP-48',
  rohs: true,
  lifecycle: 'Active',
  voltage: '2.0V – 3.6V',
  tempRange: '-40°C to +85°C',
  flash: '64 KB',
  sram: '20 KB',
  speed: '72 MHz',
  io: 37,
  category: 'Microcontrollers / ARM',
  datasheet: '#',
};

// Only suppliers with real API adapters in registry.ts are included here.
// Add a new entry when the corresponding adapter is wired up.
export const SUPPLIERS: Supplier[] = [
  {
    id: 'digikey', name: 'DigiKey', region: 'US',
    stock: 0, moq: 1, leadTime: '—', leadDays: 0,
    unitPrice: 0, currency: 'USD', updated: '—', updatedSec: 0,
    breaks: [{ qty: 1, price: 0 }],
  },
];

export const TRENDING_TAGS: { label: string; count: string }[] = [
  { label: 'STM32', count: '12.4k' },
  { label: 'ESP32', count: '9.1k' },
  { label: 'MOSFET', count: '6.7k' },
  { label: 'Capacitor', count: '5.2k' },
  { label: 'FPGA', count: '3.8k' },
  { label: 'LDO', count: '2.9k' },
];

export const RECENT_SEARCHES: string[] = [
  'TPS7A4700RGWR',
  'ATMEGA328P-AU',
  'ESP32-WROOM-32E',
  'IRF540N',
];

export const priceAtQty = (s: Supplier, qty: number): number => {
  if (s.status === 'restricted' || !s.breaks.length) return Number.POSITIVE_INFINITY;
  if (s.stock <= 0) return Number.POSITIVE_INFINITY;
  const effectiveQty = qty > s.stock ? s.stock : qty;
  let last = s.breaks[0].price;
  for (const b of s.breaks) if (effectiveQty >= b.qty) last = b.price;
  return last;
};
