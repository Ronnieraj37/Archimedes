/**
 * Token and price constants for Base Sepolia.
 *
 * PRICES (TOKEN_PRICES_USDT): Used for (1) conversion/quote in the app and (2) initial pool
 * ratios when deploying mock tokens — keep in sync with v4-template script 04_DeployMockTokensAndPools.
 *
 * ADDRESSES: Update after running 04_DeployMockTokensAndPools.s.sol; addresses are public on-chain.
 */

export const CHAIN_ID_BASE_SEPOLIA = 84532;

/** Price in USDT per 1 unit of token. Used for app quotes and for deploy script pool ratios. */
export const TOKEN_PRICES_USDT: Record<string, number> = {
  USDT: 1,
  USDC: 1.0007,
  WETH: 2104,
  WBTC: 70_230,
  DAI: 1.0006,
};

export type TokenInfo = {
  symbol: string;
  address: string;
  decimals: number;
  /** Image path (e.g. /images/tokens/usdt.svg) or URL */
  logo: string;
};

/**
 * Base Sepolia tokens — must match 04_DeployMockTokensAndPools.s.sol broadcast (run-latest.json).
 * Updated from broadcast timestamp 1770554470 (with YieldOptimizerHook + decimal-aware pricing).
 */
export const TOKENS_BASE_SEPOLIA: TokenInfo[] = [
  {
    symbol: 'USDT',
    address: '0x1483d7bfAB636450b88AB4A75fAcF14e589496a8',
    decimals: 6,
    logo: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
  },
  {
    symbol: 'USDC',
    address: '0xBfcf6CF03805BD5Ef13a0F0665262C434832b7FE',
    decimals: 6,
    logo: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
  },
  {
    symbol: 'WETH',
    address: '0x7CC14257d013286c203ae9378f4EEabFf713B717',
    decimals: 18,
    logo: 'https://assets.coingecko.com/coins/images/2518/small/weth.png',
  },
  {
    symbol: 'WBTC',
    address: '0x5c54bA14856203213D85428C6F61405BDb39D52c',
    decimals: 8,
    logo: 'https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png',
  },
  {
    symbol: 'DAI',
    address: '0xB47200B29aD83878264af21e9232C174BAceaD7A',
    decimals: 18,
    logo: 'https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png',
  },
];

export function getTokenBySymbol(symbol: string): TokenInfo | undefined {
  return TOKENS_BASE_SEPOLIA.find((t) => t.symbol.toUpperCase() === symbol.toUpperCase());
}

export function getPriceInUsdt(symbol: string): number {
  return TOKEN_PRICES_USDT[symbol.toUpperCase()] ?? 0;
}
