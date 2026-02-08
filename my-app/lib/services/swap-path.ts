/**
 * Swap path selection: we always choose the path that gives the best estimated output
 * (optimal by cost/output). Compare direct pool vs routing via intermediates and pick the best.
 */

import { getPoolKey } from '@/lib/constants/swap';
import { getQuoteForPath } from '@/lib/services/quote';

/** Tokens that can be intermediates. Must match POOL_PAIRS in swap.ts. */
const INTERMEDIATE_CANDIDATES = ['USDT', 'USDC', 'WETH', 'WBTC', 'DAI'] as const;

/** One leg: fromToken → path[1] → … → toToken. path[0] = from, path[path.length-1] = to. */
export type SwapPath = {
  fromSymbol: string;
  toSymbol: string;
  /** Ordered list of token symbols, e.g. ['WETH','USDT','WBTC']. */
  path: string[];
};

export type PathChoiceReason = 'direct_pool' | 'via_intermediate' | 'optimal_by_cost';

export type SwapPathWithReason = SwapPath & { reason: PathChoiceReason };

/**
 * Returns all candidate paths from one token to another (direct if exists, plus via each valid intermediate).
 */
function getCandidatePaths(fromSymbol: string, toSymbol: string): string[][] {
  const from = fromSymbol.toUpperCase();
  const to = toSymbol.toUpperCase();
  if (from === to) return [[from]];

  const candidates: string[][] = [];

  if (getPoolKey(from, to)) {
    candidates.push([from, to]);
  }

  for (const mid of INTERMEDIATE_CANDIDATES) {
    if (mid === from || mid === to) continue;
    if (getPoolKey(from, mid) && getPoolKey(mid, to)) {
      candidates.push([from, mid, to]);
    }
  }

  return candidates;
}

/**
 * Chooses the path that gives the highest estimated output (optimal by cost).
 * Used for every swap (single and basket).
 */
export function getPathForPair(
  fromSymbol: string,
  toSymbol: string,
  amountIn: string
): SwapPathWithReason {
  const from = fromSymbol.toUpperCase();
  const to = toSymbol.toUpperCase();
  if (from === to) {
    return { fromSymbol: from, toSymbol: to, path: [from], reason: 'optimal_by_cost' };
  }

  const candidates = getCandidatePaths(from, to);
  if (candidates.length === 0) {
    return { fromSymbol: from, toSymbol: to, path: [from, to], reason: 'optimal_by_cost' };
  }

  let bestPath = candidates[0]!;
  let bestOutput = parseFloat(getQuoteForPath(bestPath, amountIn)) || 0;

  for (let i = 1; i < candidates.length; i++) {
    const path = candidates[i]!;
    const out = parseFloat(getQuoteForPath(path, amountIn)) || 0;
    if (out > bestOutput) {
      bestOutput = out;
      bestPath = path;
    }
  }

  const reason: PathChoiceReason =
    bestPath.length === 2 ? 'direct_pool' : 'via_intermediate';

  return {
    fromSymbol: from,
    toSymbol: to,
    path: bestPath,
    reason,
  };
}

/**
 * Path selection for basket: multiple input tokens → one output token.
 * We always use optimal-by-cost path per input token.
 */
export function chooseSwapPath(
  inputTokens: Array<{ symbol: string; amount: string }>,
  outputSymbol: string
): SwapPathWithReason[] {
  const out = outputSymbol.toUpperCase();
  return inputTokens.map(({ symbol, amount }) =>
    getPathForPair(symbol.toUpperCase(), out, amount)
  );
}

export function isMultiHop(path: SwapPath): boolean {
  return path.path.length > 2;
}

export function getPathChoiceDescription(p: SwapPathWithReason): string {
  const pathStr = p.path.join(' → ');
  switch (p.reason) {
    case 'direct_pool':
      return `Direct (best output): ${pathStr}`;
    case 'via_intermediate':
      return `Via intermediate (best output): ${pathStr}`;
    case 'optimal_by_cost':
      return pathStr;
    default:
      return pathStr;
  }
}
