import type { PoolRef, TokenRef } from '@/lib/types/pools';

// Base Mainnet Token Addresses
const TOKENS_BASE: Record<string, TokenRef> = {
  USDC: {
    chainId: 8453,
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    symbol: 'USDC',
    decimals: 6,
  },
  WETH: {
    chainId: 8453,
    address: '0x4200000000000000000000000000000000000006',
    symbol: 'WETH',
    decimals: 18,
  },
  DAI: {
    chainId: 8453,
    address: '0x50c5725949A6F0c72E6C4a641F24049A917E0dAb',
    symbol: 'DAI',
    decimals: 18,
  },
  USDT: {
    chainId: 8453,
    address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    symbol: 'USDT',
    decimals: 6,
  },
  cbETH: {
    chainId: 8453,
    address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
    symbol: 'cbETH',
    decimals: 18,
  },
  OP: {
    chainId: 8453,
    address: '0x4200000000000000000000000000000000000042',
    symbol: 'OP',
    decimals: 18,
  },
};

// Mock pools for Base Mainnet - In production, fetch from Uniswap subgraph/indexer
const MOCK_POOLS: PoolRef[] = [
  {
    id: 'uni-v4-base-weth-usdc-5',
    dex: 'Uniswap',
    version: 'v4',
    chainId: 8453,
    pair: { token0: TOKENS_BASE.WETH, token1: TOKENS_BASE.USDC },
    feeBps: 5,
    apr: 18.5,
    tvlUsd: 45_200_000,
    volume24hUsd: 22_100_000,
  },
  {
    id: 'uni-v4-base-weth-usdc-30',
    dex: 'Uniswap',
    version: 'v4',
    chainId: 8453,
    pair: { token0: TOKENS_BASE.WETH, token1: TOKENS_BASE.USDC },
    feeBps: 30,
    apr: 24.2,
    tvlUsd: 12_800_000,
    volume24hUsd: 8_500_000,
  },
  {
    id: 'uni-v4-base-weth-dai-5',
    dex: 'Uniswap',
    version: 'v4',
    chainId: 8453,
    pair: { token0: TOKENS_BASE.WETH, token1: TOKENS_BASE.DAI },
    feeBps: 5,
    apr: 16.8,
    tvlUsd: 8_900_000,
    volume24hUsd: 3_200_000,
  },
  {
    id: 'uni-v4-base-usdc-usdt-1',
    dex: 'Uniswap',
    version: 'v4',
    chainId: 8453,
    pair: { token0: TOKENS_BASE.USDC, token1: TOKENS_BASE.USDT },
    feeBps: 1,
    apr: 8.2,
    tvlUsd: 28_500_000,
    volume24hUsd: 15_600_000,
  },
  {
    id: 'uni-v4-base-weth-cbeth-30',
    dex: 'Uniswap',
    version: 'v4',
    chainId: 8453,
    pair: { token0: TOKENS_BASE.WETH, token1: TOKENS_BASE.cbETH },
    feeBps: 30,
    apr: 12.4,
    tvlUsd: 5_400_000,
    volume24hUsd: 1_800_000,
  },
  {
    id: 'uni-v4-base-usdc-op-30',
    dex: 'Uniswap',
    version: 'v4',
    chainId: 8453,
    pair: { token0: TOKENS_BASE.USDC, token1: TOKENS_BASE.OP },
    feeBps: 30,
    apr: 28.5,
    tvlUsd: 3_200_000,
    volume24hUsd: 2_100_000,
  },
];

export type FindPoolsQuery = {
  chainId?: number;
  mustIncludeSymbol?: string; // e.g. "USDT"
  limit?: number;
  sortBy?: 'apr' | 'tvl' | 'volume24h';
};

export function findPools(query: FindPoolsQuery): PoolRef[] {
  const { chainId = 8453, mustIncludeSymbol, limit = 20, sortBy = 'apr' } = query;

  let pools = MOCK_POOLS.slice();
  if (chainId) pools = pools.filter((p) => p.chainId === chainId);
  if (mustIncludeSymbol) {
    const sym = mustIncludeSymbol.toUpperCase();
    pools = pools.filter((p) => p.pair.token0.symbol === sym || p.pair.token1.symbol === sym);
  }

  pools.sort((a, b) => {
    if (sortBy === 'apr') return b.apr - a.apr;
    if (sortBy === 'tvl') return b.tvlUsd - a.tvlUsd;
    return b.volume24hUsd - a.volume24hUsd;
  });

  return pools.slice(0, limit);
}

/**
 * Get dashboard statistics
 */
export function getDashboardStats(chainId: number = 8453): {
  totalTVL: number;
  totalVolume24h: number;
  totalPools: number;
  avgAPR: number;
} {
  const pools = findPools({ chainId, limit: 100 });
  const totalTVL = pools.reduce((sum, p) => sum + p.tvlUsd, 0);
  const totalVolume24h = pools.reduce((sum, p) => sum + p.volume24hUsd, 0);
  const avgAPR = pools.length > 0 ? pools.reduce((sum, p) => sum + p.apr, 0) / pools.length : 0;

  return {
    totalTVL,
    totalVolume24h,
    totalPools: pools.length,
    avgAPR,
  };
}