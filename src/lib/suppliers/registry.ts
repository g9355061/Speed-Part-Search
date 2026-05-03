import type { SupplierAdapter } from './types';
import { digikeyAdapter } from './digikey';
import { mouserHkAdapter, mouserVnAdapter } from './mouser';

const adapters: SupplierAdapter[] = [digikeyAdapter, mouserHkAdapter, mouserVnAdapter];

export function getEnabledSuppliers(): SupplierAdapter[] {
  return adapters;
}

export function getSupplier(name: string): SupplierAdapter | undefined {
  return adapters.find((a) => a.name.toLowerCase() === name.toLowerCase());
}
