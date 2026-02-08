/**
 * API Route: /api/investment
 * Handles investment management for idle liquidity
 */

import { NextRequest, NextResponse } from 'next/server';
import { createIdleLiquidityManager } from '@/lib/services/idle-liquidity-manager';
import { Address } from 'viem';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, poolId, userAddress, tokens, poolKey, chainId, allocationPercent } = body;

    const hookAddress = process.env.V4_HOOK_ADDRESS as Address;
    const privateKey = process.env.PRIVATE_KEY as `0x${string}`;

    if (!hookAddress || !privateKey) {
      return NextResponse.json(
        { error: 'Hook address or private key not configured' },
        { status: 500 }
      );
    }

    const manager = createIdleLiquidityManager(hookAddress, privateKey);

    switch (action) {
      case 'process_investment':
        if (!userAddress || !tokens || !poolKey || !chainId) {
          return NextResponse.json(
            { error: 'Missing required parameters' },
            { status: 400 }
          );
        }

        const result = await manager.processUserInvestment(
          userAddress as Address,
          tokens,
          poolKey,
          chainId,
          allocationPercent || 0
        );

        return NextResponse.json({ success: true, result });

      case 'check_and_invest':
        if (!poolId) {
          return NextResponse.json(
            { error: 'poolId required' },
            { status: 400 }
          );
        }

        const invested = await manager.checkAndInvest(poolId, {
          platform: '0x...' as Address, // Would be actual platform address
          platformName: 'Aave',
          apy: 4.5,
          minLockPeriod: 0,
        });

        return NextResponse.json({ success: invested });

      case 'withdraw':
        const { positionIndex, amount } = body;
        if (!poolId || positionIndex === undefined || !amount) {
          return NextResponse.json(
            { error: 'poolId, positionIndex, and amount required' },
            { status: 400 }
          );
        }

        const withdrawn = await manager.withdrawInvestment(
          poolId,
          positionIndex,
          BigInt(amount)
        );

        return NextResponse.json({ success: withdrawn });

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: process_investment, check_and_invest, or withdraw' },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
    console.error('Investment API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
