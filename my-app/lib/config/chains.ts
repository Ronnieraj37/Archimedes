/**
 * Chain configuration for multi-chain support
 */

export const CHAINS = {
  ETHEREUM: {
    id: 1,
    name: 'Ethereum',
    rpc: process.env.ETHEREUM_RPC || 'https://eth.llamarpc.com',
  },
  BASE: {
    id: 8453,
    name: 'Base',
    rpc: process.env.BASE_RPC || 'https://mainnet.base.org',
  },
  ARBITRUM: {
    id: 42161,
    name: 'Arbitrum',
    rpc: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
  },
  ARC: {
    id: 1243, // Arc chain ID (verify from docs)
    name: 'Arc',
    rpc: process.env.ARC_RPC || 'https://rpc.arc.network',
  },
} as const;

export const TOKENS = {
  USDC: {
    ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    arc: '0x...', // Arc USDC address (verify from docs)
  },
  WETH: {
    ethereum: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    base: '0x4200000000000000000000000000000000000006',
    arbitrum: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  },
} as const;
