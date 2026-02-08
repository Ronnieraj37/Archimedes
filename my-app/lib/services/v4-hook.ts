/**
 * Uniswap v4 Hook Integration
 * Interacts with YieldOptimizerHook.sol contract
 */

import { createPublicClient, createWalletClient, http, Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Intent } from '../types/intent';
import { CHAINS } from '../config/chains';

// ABI for YieldOptimizerHook - using any to avoid build-time parsing issues
// In production, this should be properly typed
const HOOK_ABI: any = [
  {
    type: 'function',
    name: 'addLiquidityWithBasket',
    inputs: [
      { name: 'key', type: 'tuple', internalType: 'struct PoolKey', components: [
        { name: 'currency0', type: 'address', internalType: 'address' },
        { name: 'currency1', type: 'address', internalType: 'address' },
        { name: 'fee', type: 'uint24', internalType: 'uint24' },
        { name: 'tickSpacing', type: 'int24', internalType: 'int24' },
        { name: 'hooks', type: 'address', internalType: 'address' }
      ]},
      { name: 'basket', type: 'tuple[]', internalType: 'struct BasketToken[]', components: [
        { name: 'currency', type: 'address', internalType: 'address' },
        { name: 'amount', type: 'uint256', internalType: 'uint256' }
      ]},
      { name: 'params', type: 'tuple', internalType: 'struct ModifyLiquidityParams', components: [
        { name: 'tickLower', type: 'int24', internalType: 'int24' },
        { name: 'tickUpper', type: 'int24', internalType: 'int24' },
        { name: 'liquidityDelta', type: 'int256', internalType: 'int256' },
        { name: 'salt', type: 'bytes32', internalType: 'bytes32' }
      ]},
      { name: 'hookData', type: 'bytes', internalType: 'bytes' }
    ],
    outputs: [
      { name: 'delta', type: 'tuple', internalType: 'struct BalanceDelta', components: [
        { name: 'currency0', type: 'int128', internalType: 'int128' },
        { name: 'currency1', type: 'int128', internalType: 'int128' }
      ]},
      { name: 'fees', type: 'tuple', internalType: 'struct BalanceDelta', components: [
        { name: 'currency0', type: 'int128', internalType: 'int128' },
        { name: 'currency1', type: 'int128', internalType: 'int128' }
      ]}
    ],
    stateMutability: 'payable'
  },
  {
    type: 'function',
    name: 'getPoolMetrics',
    inputs: [{ name: 'poolId', type: 'bytes32', internalType: 'bytes32' }],
    outputs: [
      { name: 'volume', type: 'uint256', internalType: 'uint256' },
      { name: 'threshold', type: 'uint256', internalType: 'uint256' },
      { name: 'lastCheck', type: 'uint256', internalType: 'uint256' }
    ],
    stateMutability: 'view'
  },
  // getIdlePositions removed temporarily due to ABI parsing issues with tuple arrays
  // Will be added back with proper typing
] as const;

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

export interface BasketToken {
  currency: Address;
  amount: bigint;
}

export interface ModifyLiquidityParams {
  tickLower: number;
  tickUpper: number;
  liquidityDelta: bigint;
  salt: `0x${string}`;
}

/**
 * Create client for interacting with v4 hook
 */
function createHookClient(chainId: number) {
  const rpcUrl = Object.values(CHAINS).find((c) => c.id === chainId)?.rpc;
  if (!rpcUrl) {
    throw new Error(`No RPC URL found for chain ${chainId}`);
  }

  return createPublicClient({
    chain: {
      id: chainId,
      name: Object.values(CHAINS).find((c) => c.id === chainId)?.name || 'Unknown',
      network: 'unknown',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    },
    transport: http(rpcUrl),
  });
}

/**
 * Convert Intent to hook call parameters
 */
export function intentToHookParams(
  intent: Intent,
  hookAddress: Address
): {
  poolKey: PoolKey;
  basket: BasketToken[];
  params: ModifyLiquidityParams;
} {
  if (!intent.targetPool) {
    throw new Error('Target pool required for liquidity operations');
  }

  const poolKey: PoolKey = {
    currency0: intent.targetPool.currency0 as Address,
    currency1: intent.targetPool.currency1 as Address,
    fee: 3000, // Default 0.3% fee - should be configurable
    tickSpacing: 60, // Default tick spacing - should be configurable
    hooks: hookAddress,
  };

  const basket: BasketToken[] = intent.sourceAssets.map((asset) => ({
    currency: asset.token as Address,
    amount: BigInt(asset.amount),
  }));

  // Calculate tick range (simplified - in production would use current price)
  const tickLower = -887272; // Full range lower
  const tickUpper = 887272; // Full range upper

  const params: ModifyLiquidityParams = {
    tickLower,
    tickUpper,
    liquidityDelta: BigInt(0), // Would calculate from amounts
    salt: `0x${Math.random().toString(16).substr(2, 64)}` as `0x${string}`,
  };

  return { poolKey, basket, params };
}

/**
 * Call addLiquidityWithBasket on the hook
 */
export async function addLiquidityWithBasket(
  hookAddress: Address,
  poolKey: PoolKey,
  basket: BasketToken[],
  params: ModifyLiquidityParams,
  chainId: number,
  signer?: `0x${string}` // Private key for signing
): Promise<`0x${string}`> {
  const publicClient = createHookClient(chainId);

  if (!signer) {
    throw new Error('Signer required for transaction execution');
  }

  const account = privateKeyToAccount(signer);
  const walletClient = createWalletClient({
    account,
    chain: publicClient.chain,
    transport: http(),
  });

  // Prepare the call
  const { request } = await publicClient.simulateContract({
    address: hookAddress,
    abi: HOOK_ABI,
    functionName: 'addLiquidityWithBasket',
    args: [poolKey, basket, params, '0x'],
    account,
  });

  // Execute the transaction
  const hash = await walletClient.writeContract(request);

  return hash;
}

/**
 * Get idle positions for a pool
 * Note: Temporarily disabled due to ABI parsing issues
 */
export async function getIdlePositions(
  hookAddress: Address,
  poolId: `0x${string}`,
  chainId: number
): Promise<unknown[]> {
  // TODO: Re-enable when ABI parsing supports tuple arrays
  return [];
}

/**
 * Get pool metrics
 */
export async function getPoolMetrics(
  hookAddress: Address,
  poolId: `0x${string}`,
  chainId: number
): Promise<{
  volume: bigint;
  threshold: bigint;
  lastCheck: bigint;
}> {
  const publicClient = createHookClient(chainId);

  const metrics = (await publicClient.readContract({
    address: hookAddress,
    abi: HOOK_ABI,
    functionName: 'getPoolMetrics',
    args: [poolId],
  })) as readonly [bigint, bigint, bigint];

  return {
    volume: metrics[0],
    threshold: metrics[1],
    lastCheck: metrics[2],
  };
}
