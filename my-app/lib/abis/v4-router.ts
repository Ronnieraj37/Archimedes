/**
 * Minimal ABI for Hookmate V4 Swap Router (IUniswapV4Router04).
 * Single-pool: swapExactTokensForTokens(amountIn, amountOutMin, zeroForOne, poolKey, hookData, receiver, deadline).
 * Multi-pool: swapExactTokensForTokens(amountIn, amountOutMin, startCurrency, path, receiver, deadline).
 */

const poolKeyStruct = {
  currency0: 'address',
  currency1: 'address',
  fee: 'uint24',
  tickSpacing: 'int24',
  hooks: 'address',
} as const;

const pathKeyStruct = {
  intermediateCurrency: 'address',
  fee: 'uint24',
  tickSpacing: 'int24',
  hooks: 'address',
  hookData: 'bytes',
} as const;

export const v4RouterAbi = [
  // Single-pool swap
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'zeroForOne', type: 'bool' },
      { name: 'poolKey', type: 'tuple', components: Object.entries(poolKeyStruct).map(([n, t]) => ({ name: n, type: t })) },
      { name: 'hookData', type: 'bytes' },
      { name: 'receiver', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'swapExactTokensForTokens',
    outputs: [
      { name: 'delta', type: 'tuple', components: [{ name: 'amount0', type: 'int128' }, { name: 'amount1', type: 'int128' }] },
    ],
    stateMutability: 'payable',
    type: 'function',
  },
  // Multi-hop swap
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'startCurrency', type: 'address' },
      { name: 'path', type: 'tuple[]', components: Object.entries(pathKeyStruct).map(([n, t]) => ({ name: n, type: t })) },
      { name: 'receiver', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'swapExactTokensForTokens',
    outputs: [
      { name: 'delta', type: 'tuple', components: [{ name: 'amount0', type: 'int128' }, { name: 'amount1', type: 'int128' }] },
    ],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;
