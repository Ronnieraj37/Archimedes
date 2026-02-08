/**
 * LI.FI SDK Integration
 * Handles cross-chain routing and multi-token aggregation
 */

import { getRoutes, executeRoute, type Route } from '@lifi/sdk';

export interface LifiRouteParams {
  fromChain: number;
  fromToken: string;
  fromAmount: string;
  toChain: number;
  toToken: string;
  fromAddress: string;
  toAddress: string;
}

/**
 * Get the best route for a cross-chain swap
 */
export async function getLifiRoute(params: LifiRouteParams): Promise<Route | null> {
  try {
    const routeRequest = {
      fromChain: params.fromChain,
      fromToken: params.fromToken,
      fromAmount: params.fromAmount,
      toChain: params.toChain,
      toToken: params.toToken,
      fromAddress: params.fromAddress,
      toAddress: params.toAddress,
    } as any;

    const routeOptions = {
      order: 'RECOMMENDED' as const,
      slippage: 0.005, // 0.5%
      allowSwitchChain: false,
    } as any;

    const routes = await getRoutes(routeRequest, routeOptions);

    if (routes.routes && routes.routes.length > 0) {
      return routes.routes[0]; // Return best route
    }

    return null;
  } catch (error) {
    console.error('LI.FI route error:', error);
    return null;
  }
}

/**
 * Execute a LI.FI route (swap + bridge)
 */
export async function executeLifiRoute(
  route: Route,
  executionOptions?: unknown // Execution options (wallet, etc.)
): Promise<string> {
  try {
    const result = await executeRoute(route, executionOptions as any);
    // Route execution returns updated route, extract tx hash from steps
    const lastStep = result.steps[result.steps.length - 1];
    return (lastStep as any)?.transactionHash || (lastStep as any)?.txHash || '';
  } catch (error) {
    console.error('LI.FI execution error:', error);
    throw error;
  }
}

/**
 * Aggregate multiple tokens from different chains into a single target
 * This is the "multi-token basket" feature
 */
export async function aggregateMultiTokenRoute(
  sourceAssets: Array<{
    chain: number;
    token: string;
    amount: string;
  }>,
  targetChain: number,
  targetToken: string,
  userAddress: string
): Promise<Route[]> {
  const routes: Route[] = [];

  // Get routes for each source asset
  for (const asset of sourceAssets) {
    const route = await getLifiRoute({
      fromChain: asset.chain,
      fromToken: asset.token,
      fromAmount: asset.amount,
      toChain: targetChain,
      toToken: targetToken,
      fromAddress: userAddress,
      toAddress: userAddress,
    });

    if (route) {
      routes.push(route);
    }
  }

  return routes;
}
