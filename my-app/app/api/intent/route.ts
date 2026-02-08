/**
 * API Route: /api/intent
 * Handles intent processing and execution
 */

import { NextRequest, NextResponse } from 'next/server';
import { Intent } from '@/lib/types/intent';
import { processIntent, estimateIntentCost } from '@/lib/services/intent-processor';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { intent, userAddress, useYellowSession = true } = body;

    // Validate intent structure
    if (!intent || !intent.sourceAssets || !intent.targetAction) {
      return NextResponse.json(
        { error: 'Invalid intent structure' },
        { status: 400 }
      );
    }

    if (!userAddress) {
      return NextResponse.json(
        { error: 'User address required' },
        { status: 400 }
      );
    }

    // Process the intent
    const result = await processIntent(intent as Intent, userAddress, useYellowSession);

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Intent processing error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const intentJson = searchParams.get('intent');

    if (!intentJson) {
      return NextResponse.json(
        { error: 'Intent parameter required' },
        { status: 400 }
      );
    }

    const intent: Intent = JSON.parse(intentJson);
    const estimate = await estimateIntentCost(intent);

    return NextResponse.json(estimate);
  } catch (error: unknown) {
    console.error('Estimation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
