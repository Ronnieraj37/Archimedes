/**
 * LI.FI cross-chain quote API
 * GET /api/lifi/quote?fromChain=&toChain=&fromToken=&toToken=&amount=&fromAddress=
 */

import { NextRequest, NextResponse } from 'next/server';
import { getLifiRoute } from '@/lib/services/lifi';

const KNOWN_CHAINS = [1, 8453, 84532] as const; // Ethereum, Base, Base Sepolia
function parseChainId(v: string | null): number | null {
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && KNOWN_CHAINS.includes(n as (typeof KNOWN_CHAINS)[number]) ? n : null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fromChainId = parseChainId(searchParams.get('fromChain'));
    const toChainId = parseChainId(searchParams.get('toChain'));
    const fromToken = searchParams.get('fromToken')?.trim() || '';
    const toToken = searchParams.get('toToken')?.trim() || '';
    const amount = searchParams.get('amount')?.trim() || '';
    const fromAddress = searchParams.get('fromAddress')?.trim() || '';

    if (!fromChainId || !toChainId || !fromToken || !toToken || !amount || !fromAddress) {
      return NextResponse.json(
        { error: 'Missing: fromChain, toChain, fromToken, toToken, amount, fromAddress' },
        { status: 400 }
      );
    }
    if (fromChainId === toChainId) {
      return NextResponse.json({ error: 'fromChain and toChain must differ for cross-chain quote' }, { status: 400 });
    }

    const route = await getLifiRoute({
      fromChain: fromChainId,
      fromToken,
      fromAmount: amount,
      toChain: toChainId,
      toToken,
      fromAddress,
      toAddress: fromAddress,
    });

    if (!route) {
      return NextResponse.json({ error: 'No route found', route: null }, { status: 200 });
    }

    const summary = {
      fromChain: route.fromChainId,
      toChain: route.toChainId,
      fromAmount: route.fromAmount,
      toAmount: route.toAmount,
      steps: route.steps?.length ?? 0,
      gasCosts: route.gasCosts,
    };
    return NextResponse.json({ route: summary, fullRoute: route });
  } catch (error) {
    console.error('LI.FI quote error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Quote failed' },
      { status: 500 }
    );
  }
}
