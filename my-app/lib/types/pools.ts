export type ChainId = number;

export type TokenRef = {
  chainId: ChainId;
  address: `0x${string}`;
  symbol: string;
  decimals: number;
};

export type PoolRef = {
  id: string;
  dex: 'Uniswap';
  version: 'v4' | 'v3';
  chainId: ChainId;
  pair: {
    token0: TokenRef;
    token1: TokenRef;
  };
  feeBps: number;
  apr: number; // percentage APR, e.g. 18.2
  tvlUsd: number;
  volume24hUsd: number;
};

