import type { SupplierAdapter } from './types';
import { digikeyAdapter } from './digikey';
import { mouserHkAdapter, mouserVnAdapter, mouserCnAdapter } from './mouser';

const adapters: SupplierAdapter[] = [digikeyAdapter, mouserHkAdapter, mouserVnAdapter];

/**
 * 只在「人在看價格」的入口（/api/search）才納入的來源。
 * Mouser CN 報的是人民幣，刻意不進 getEnabledSuppliers()：
 * 缺料預測與名單查驗會整批掃料，多一家就多燒一輪配額，
 * 而且那邊的風險規則只認 USD，混進 CNY 會算錯。
 */
const quoteOnlyAdapters: SupplierAdapter[] = [mouserCnAdapter];

export function getEnabledSuppliers(): SupplierAdapter[] {
  return adapters;
}

export function getQuoteSuppliers(): SupplierAdapter[] {
  return [...adapters, ...quoteOnlyAdapters];
}

export function getSupplier(name: string): SupplierAdapter | undefined {
  return getQuoteSuppliers().find((a) => a.name.toLowerCase() === name.toLowerCase());
}
