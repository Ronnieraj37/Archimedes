import { NextRequest, NextResponse } from 'next/server';
import { findPools } from '@/lib/services/pools';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const chainId = searchParams.get('chainId');
  const symbol = searchParams.get('symbol');
  const limit = searchParams.get('limit');
  const sortBy = searchParams.get('sortBy');

  const pools = findPools({
    chainId: chainId ? Number(chainId) : undefined,
    mustIncludeSymbol: symbol || undefined,
    limit: limit ? Number(limit) : undefined,
    sortBy:
      sortBy === 'apr' || sortBy === 'tvl' || sortBy === 'volume24h'
        ? sortBy
        : undefined,
  });

  return NextResponse.json({ pools });
}

