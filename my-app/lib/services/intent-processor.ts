/**
 * Intent Processor
 * Orchestrates all sponsor integrations to execute user intents
 */

import { Intent, SourceAsset } from '../types/intent';
import { getLifiRoute, aggregateMultiTokenRoute, executeLifiRoute } from './lifi';
import { yellowSDK, YellowSession } from './yellow';
import { circleSDK } from './circle';
import { intentToHookParams, addLiquidityWithBasket } from './v4-hook';

export interface ExecutionResult {
  success: boolean;
  txHash?: string;
  sessionId?: string;
  error?: string;
  steps: Array<{
    type: string;
    status: 'pending' | 'completed' | 'failed';
    txHash?: string;
  }>;
}

/**
 * Process an intent and execute it using the appropriate sponsor SDKs
 */
export async function processIntent(
  intent: Intent,
  userAddress: string,
  useYellowSession: boolean = true
): Promise<ExecutionResult> {
  const steps: ExecutionResult['steps'] = [];
  let sessionId: string | undefined;
  let finalTxHash: string | undefined;

  try {
    // Step 1: Create Yellow session if enabled
    if (useYellowSession) {
      const session = await yellowSDK.createSession(
        userAddress,
        intent.targetPool?.chain || intent.targetToken?.chain || 1,
        intent.sourceAssets.length === 1
          ? {
              token: intent.sourceAssets[0].token,
              amount: intent.sourceAssets[0].amount,
            }
          : undefined
      );
      sessionId = session.sessionId;
      steps.push({ type: 'yellow_session_created', status: 'completed' });
    }

    // Step 2: Handle multi-token aggregation via LI.FI
    if (intent.sourceAssets.length > 1 && intent.targetPool) {
      // Multiple source assets need to be aggregated
      const targetChain = intent.targetPool.chain;
      const targetToken = intent.targetPool.currency0; // Or currency1 based on logic

      const routes = await aggregateMultiTokenRoute(
        intent.sourceAssets,
        targetChain,
        targetToken,
        userAddress
      );

      steps.push({ type: 'lifi_routes_found', status: 'completed' });

      // Execute routes (in production, would batch or sequence these)
      for (const route of routes) {
        if (useYellowSession && sessionId) {
          // Execute off-chain via Yellow
          await yellowSDK.executeOffChainTransaction(sessionId, {
            type: 'swap',
            from: route.fromToken.address,
            to: route.toToken.address,
            token: route.fromToken.address,
            amount: route.fromAmount,
          });
          steps.push({ type: 'yellow_swap', status: 'completed' });
        } else {
          // Execute on-chain via LI.FI
          // Note: Would need signer here
          // const txHash = await executeLifiRoute(route, signer);
          // steps.push({ type: 'lifi_execution', status: 'completed', txHash });
        }
      }
    } else if (intent.sourceAssets.length === 1) {
      // Single asset swap
      const source = intent.sourceAssets[0];
      const targetChain = intent.targetPool?.chain || intent.targetToken?.chain || source.chain;
      const targetToken =
        intent.targetPool?.currency0 || intent.targetToken?.address || '';

      if (source.chain !== targetChain || source.token !== targetToken) {
        // Cross-chain or cross-token swap needed
        const route = await getLifiRoute({
          fromChain: source.chain,
          fromToken: source.token,
          fromAmount: source.amount,
          toChain: targetChain,
          toToken: targetToken,
          fromAddress: userAddress,
          toAddress: userAddress,
        });

        if (route) {
          if (useYellowSession && sessionId) {
            await yellowSDK.executeOffChainTransaction(sessionId, {
              type: 'swap',
              from: source.token,
              to: targetToken,
              token: source.token,
              amount: source.amount,
            });
            steps.push({ type: 'yellow_swap', status: 'completed' });
          } else {
            // Execute on-chain
            steps.push({ type: 'lifi_route_ready', status: 'pending' });
          }
        }
      }
    }

    // Step 3: Execute final action (add liquidity, swap, etc.)
    if (intent.targetAction === 'ADD_LIQUIDITY' && intent.targetPool) {
      // Get hook address from environment
      const hookAddress = process.env.V4_HOOK_ADDRESS as `0x${string}`;
      if (!hookAddress) {
        throw new Error('V4_HOOK_ADDRESS not configured');
      }

      if (useYellowSession && sessionId) {
        // Execute off-chain liquidity addition
        await yellowSDK.executeOffChainTransaction(sessionId, {
          type: 'liquidity',
          from: userAddress,
          to: intent.targetPool.poolId,
          token: intent.targetPool.currency0,
          amount: '0', // Would calculate from intent
        });
        steps.push({ type: 'yellow_liquidity', status: 'completed' });
      } else {
        // Call our v4 hook's addLiquidityWithBasket function
        const { poolKey, basket, params } = intentToHookParams(intent, hookAddress);
        
        // Note: In production, this would use the user's signer
        // For now, we'll prepare the transaction
        const chainId = intent.targetPool.chain;
        const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
        
        if (privateKey) {
          const txHash = await addLiquidityWithBasket(
            hookAddress,
            poolKey,
            basket,
            params,
            chainId,
            privateKey
          );
          steps.push({ type: 'v4_hook_liquidity', status: 'completed', txHash });
          finalTxHash = txHash;
        } else {
          steps.push({ type: 'v4_hook_liquidity', status: 'pending' });
        }
      }
    }

    // Step 4: Settle Yellow session if used
    if (useYellowSession && sessionId) {
      const settlement = await yellowSDK.endSession(sessionId);
      finalTxHash = settlement.txHash;
      steps.push({ type: 'yellow_settlement', status: 'completed', txHash: finalTxHash });
    }

    return {
      success: true,
      txHash: finalTxHash,
      sessionId,
      steps,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      sessionId,
      steps,
    };
  }
}

/**
 * Estimate gas and cost for an intent
 */
export async function estimateIntentCost(intent: Intent): Promise<{
  estimatedGas: string;
  estimatedCost: string;
  steps: number;
}> {
  // TODO: Implement actual estimation
  // This would:
  // 1. Get LI.FI route estimates
  // 2. Calculate gas for v4 hook calls
  // 3. Factor in Yellow session settlement cost

  return {
    estimatedGas: '0',
    estimatedCost: '0',
    steps: intent.sourceAssets.length + (intent.targetAction === 'ADD_LIQUIDITY' ? 1 : 0),
  };
}
