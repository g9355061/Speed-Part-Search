import { NextResponse } from 'next/server';
import { getMarketReportsCache } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cache = await getMarketReportsCache();
  return NextResponse.json({ cache });
}
