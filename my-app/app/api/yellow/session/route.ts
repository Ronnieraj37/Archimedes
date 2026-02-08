/**
 * API Route: /api/yellow/session
 * Manages Yellow Network trading sessions
 */

import { NextRequest, NextResponse } from 'next/server';
import { yellowSDK } from '@/lib/services/yellow';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, walletAddress, chainId, sessionId, initialDeposit } = body;

    switch (action) {
      case 'create':
        if (!walletAddress || !chainId) {
          return NextResponse.json(
            { error: 'walletAddress and chainId required' },
            { status: 400 }
          );
        }

        const session = await yellowSDK.createSession(
          walletAddress,
          chainId,
          initialDeposit
        );

        return NextResponse.json({ session });

      case 'end':
        if (!sessionId) {
          return NextResponse.json(
            { error: 'sessionId required' },
            { status: 400 }
          );
        }

        const settlement = await yellowSDK.endSession(sessionId);
        return NextResponse.json({ settlement });

      case 'balance':
        if (!sessionId) {
          return NextResponse.json(
            { error: 'sessionId required' },
            { status: 400 }
          );
        }

        const balance = await yellowSDK.getSessionBalance(sessionId);
        return NextResponse.json({ balance });

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: create, end, or balance' },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
    console.error('Yellow session error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
