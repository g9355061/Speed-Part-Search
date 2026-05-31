import { NextResponse } from 'next/server';
import { getEnabledSuppliers } from '@/lib/suppliers/registry';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    ok: true,
    suppliers: getEnabledSuppliers().map((s) => s.name),
    digikeyEnv: process.env.DIGIKEY_ENV ?? 'sandbox',
    hasCredentials: Boolean(
      process.env.DIGIKEY_CLIENT_ID && process.env.DIGIKEY_CLIENT_SECRET
    ),
  });
}
