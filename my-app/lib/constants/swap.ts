/**
 * Uniswap v4 swap router and pool config for Base Sepolia.
 * Pools from script 04_DeployMockTokensAndPools (USDT/WETH, USDT/WBTC); fee 0.30%, tickSpacing 60.
 */

import { CHAIN_ID_BASE_SEPOLIA } from './tokens';
import { getTokenBySymbol } from './tokens';

export const CHAIN_ID = CHAIN_ID_BASE_SEPOLIA;

/** Permit2 canonical address (same on all chains) */
export const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as const;

/** Hookmate V4 Swap Router on Base Sepolia */
export const V4_SWAP_ROUTER_ADDRESS = '0x71cD4Ea054F9Cb3D3BF6251A00673303411A7DD9' as const;

/** BasketSwapper — wraps N swaps in ONE tx.  Deploy with 05_DeployBasketSwapper.s.sol, then paste address here. */
export const BASKET_SWAPPER_ADDRESS = '0x91C39d20aA835db4b5A6Bc45203046F342E85926' as const;

export const POOL_FEE = 3000; // 0.30%
export const TICK_SPACING = 60;
/** YieldOptimizerHook deployed via 00_DeployYieldOptimizerHook.s.sol on Base Sepolia */
export const HOOKS_ADDRESS = '0x05a6b10faaE4C0B687a160Ffb1848EF4aE148cC0' as const;

/** PoolKey (currency0, currency1, fee, tickSpacing, hooks). currency0 < currency1 by address. */
export type PoolKeyStruct = {
  currency0: `0x${string}`;
  currency1: `0x${string}`;
  fee: number;
  tickSpacing: number;
  hooks: `0x${string}`;
};

/**
 * Pairs that have a pool on Base Sepolia (script 04).
 * Keys MUST be alphabetically sorted by symbol (e.g. USDC-USDT not USDT-USDC)
 * because getPoolKey does [a,b].sort().join('-') to look them up.
 *
 * Alphabetical order: DAI < USDC < USDT < WBTC < WETH
 */
const POOL_PAIRS = [
  'DAI-USDT',
  'USDC-USDT',
  'USDT-WBTC',
  'USDT-WETH',
  'WBTC-WETH',  // WBTC < WETH alphabetically (B < E)
] as const;

/** Get pool key for a token pair (symbol order independent). Uses addresses from tokens.ts. */
export function getPoolKey(tokenA: string, tokenB: string): PoolKeyStruct | undefined {
  const key = [tokenA, tokenB].map((s) => s.toUpperCase()).sort().join('-');
  if (!POOL_PAIRS.includes(key as (typeof POOL_PAIRS)[number])) return undefined;
  const addrA = getTokenBySymbol(tokenA)?.address;
  const addrB = getTokenBySymbol(tokenB)?.address;
  if (!addrA || !addrB || addrA.startsWith('0x0000') || addrB.startsWith('0x0000')) return undefined;
  const [c0, c1] = addrA.toLowerCase() < addrB.toLowerCase() ? [addrA, addrB] : [addrB, addrA];
  return {
    currency0: c0 as `0x${string}`,
    currency1: c1 as `0x${string}`,
    fee: POOL_FEE,
    tickSpacing: TICK_SPACING,
    hooks: HOOKS_ADDRESS,
  };
}

/** Resolve token address to `0x${string}`. */
export function tokenAddress(symbol: string): `0x${string}` | undefined {
  const t = getTokenBySymbol(symbol);
  if (!t?.address || t.address.startsWith('0x0000')) return undefined;
  return t.address as `0x${string}`;
}
