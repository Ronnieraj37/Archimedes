/**
 * ABI for BasketSwapper — wraps N single-pool swaps into ONE transaction.
 */

export const basketSwapperAbi = [
  {
    inputs: [
      {
        name: 'inputs',
        type: 'tuple[]',
        components: [
          { name: 'token', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMin', type: 'uint256' },
          { name: 'zeroForOne', type: 'bool' },
          {
            name: 'poolKey',
            type: 'tuple',
            components: [
              { name: 'currency0', type: 'address' },
              { name: 'currency1', type: 'address' },
              { name: 'fee', type: 'uint24' },
              { name: 'tickSpacing', type: 'int24' },
              { name: 'hooks', type: 'address' },
            ],
          },
        ],
      },
      { name: 'receiver', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'basketSwap',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
