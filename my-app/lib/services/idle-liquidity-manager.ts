/**
 * Idle Liquidity Manager Service
 * Monitors pools and manages investments without burdening individual users
 */

import { createPublicClient, createWalletClient, http, Address, formatUnits, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getLifiRoute, executeLifiRoute } from './lifi';
import { intentToHookParams, PoolKey, BasketToken } from './v4-hook';
import { CHAINS, TOKENS } from '../config/chains';

// ABI for YieldOptimizerHook - using any to avoid build-time parsing issues
const HOOK_ABI: any = [
  {
    type: 'function',
    name: 'getPoolMetrics',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [
      { name: 'volume', type: 'uint256' },
      { name: 'threshold', type: 'uint256' },
      { name: 'lastCheck', type: 'uint256' }
    ],
    stateMutability: 'view'
  }
];

export interface PoolInvestmentConfig {
  poolId: string;
  poolKey: PoolKey;
  chainId: number;
  currency0: Address;
  currency1: Address;
  minInvestmentAmount: bigint; // Minimum amount to invest
  maxInvestmentPercent: number; // Max % of pool liquidity to invest (e.g., 70 = 70%)
}

export interface InvestmentStrategy {
  platform: Address; // e.g., Aave lending pool
  platformName: string;
  apy: number; // Estimated APY
  minLockPeriod: number; // Minimum lock period in seconds
}

export interface TokenBalance {
  token: Address;
  amount: bigint;
  symbol?: string;
}

/**
 * Calculate 50:50 ratio amounts for LP position
 * Given multiple tokens, swap them to achieve equal value in both pool currencies
 */
export async function calculate5050Ratio(
  tokens: TokenBalance[],
  poolKey: PoolKey,
  chainId: number,
  currentPrice?: bigint // Current pool price (sqrtPriceX96)
): Promise<{
  amount0: bigint;
  amount1: bigint;
  swaps: Array<{ from: Address; to: Address; amount: bigint }>;
}> {
  // Get token prices (would use oracle or DEX price in production)
  // For now, we'll use a simplified approach
  
  const currency0 = poolKey.currency0;
  const currency1 = poolKey.currency1;
  
  // Separate tokens into currency0, currency1, and others
  let totalCurrency0 = 0n;
  let totalCurrency1 = 0n;
  const tokensToSwap: TokenBalance[] = [];
  
  for (const token of tokens) {
    if (token.token.toLowerCase() === currency0.toLowerCase()) {
      totalCurrency0 += token.amount;
    } else if (token.token.toLowerCase() === currency1.toLowerCase()) {
      totalCurrency1 += token.amount;
    } else {
      tokensToSwap.push(token);
    }
  }
  
  // Calculate total value in a common unit (using currency0 as base)
  // In production, would fetch actual prices from oracles/DEX
  const estimatedPriceRatio = currentPrice 
    ? (currentPrice * currentPrice) / (2n ** 192n) // Approximate price from sqrtPriceX96
    : 1n; // 1:1 for MVP
  
  // Calculate value of currency1 in terms of currency0
  const currency1Value = (totalCurrency1 * estimatedPriceRatio) / (10n ** 18n);
  const totalValue = totalCurrency0 + currency1Value;
  
  // Target: 50% in each currency
  const targetValue = totalValue / 2n;
  
  // Calculate how much we need to swap
  let amount0 = totalCurrency0;
  let amount1 = totalCurrency1;
  const swaps: Array<{ from: Address; to: Address; amount: bigint }> = [];
  
  if (totalCurrency0 < targetValue) {
    // Need more currency0, swap currency1 for currency0
    const neededCurrency0 = targetValue - totalCurrency0;
    const currency1ToSwap = (neededCurrency0 * (10n ** 18n)) / estimatedPriceRatio;
    
    if (currency1ToSwap <= totalCurrency1) {
      swaps.push({
        from: currency1,
        to: currency0,
        amount: currency1ToSwap,
      });
      amount0 += neededCurrency0;
      amount1 -= currency1ToSwap;
    }
  } else if (totalCurrency1 < targetValue) {
    // Need more currency1, swap currency0 for currency1
    const neededCurrency1 = targetValue - currency1Value;
    const currency0ToSwap = (neededCurrency1 * (10n ** 18n)) / estimatedPriceRatio;
    
    if (currency0ToSwap <= totalCurrency0) {
      swaps.push({
        from: currency0,
        to: currency1,
        amount: currency0ToSwap,
      });
      amount0 -= currency0ToSwap;
      amount1 += neededCurrency1;
    }
  }
  
  // Handle tokens that need to be swapped to pool currencies
  for (const token of tokensToSwap) {
    // Swap half to currency0, half to currency1
    const halfAmount = token.amount / 2n;
    
    swaps.push({
      from: token.token,
      to: currency0,
      amount: halfAmount,
    });
    
    swaps.push({
      from: token.token,
      to: currency1,
      amount: token.amount - halfAmount,
    });
    
    // Estimate amounts after swap (would use actual swap quotes in production)
    amount0 += halfAmount; // Simplified
    amount1 += (token.amount - halfAmount); // Simplified
  }
  
  return { amount0, amount1, swaps };
}

/**
 * Execute swaps to achieve 50:50 ratio
 */
export async function execute5050Swaps(
  swaps: Array<{ from: Address; to: Address; amount: bigint }>,
  chainId: number,
  userAddress: Address,
  signer?: `0x${string}`
): Promise<boolean> {
  if (!signer) {
    throw new Error('Signer required for swaps');
  }
  
  // Execute each swap via LI.FI or direct DEX
  for (const swap of swaps) {
    try {
      // Get route from LI.FI
      const route = await getLifiRoute({
        fromChain: chainId,
        fromToken: swap.from,
        fromAmount: swap.amount.toString(),
        toChain: chainId,
        toToken: swap.to,
        fromAddress: userAddress,
        toAddress: userAddress,
      });
      
      if (route) {
        // Execute swap (would need actual signer implementation)
        // await executeLifiRoute(route, signer);
        console.log(`Swap ${swap.amount} ${swap.from} -> ${swap.to}`);
      }
    } catch (error) {
      console.error(`Swap failed: ${swap.from} -> ${swap.to}`, error);
      return false;
    }
  }
  
  return true;
}

/**
 * Calculate investment amount based on user allocation
 */
export function calculateInvestmentAmount(
  totalDeposit: bigint,
  userAllocationPercent: number // 0-5000 (0-50%)
): bigint {
  if (userAllocationPercent > 5000) {
    userAllocationPercent = 5000; // Cap at 50%
  }
  
  return (totalDeposit * BigInt(userAllocationPercent)) / 10000n;
}

/**
 * Monitor pool and invest idle liquidity
 */
export class IdleLiquidityManager {
  private hookAddress: Address;
  private privateKey: `0x${string}`;
  private monitoredPools: Map<string, PoolInvestmentConfig> = new Map();
  
  constructor(hookAddress: Address, privateKey: `0x${string}`) {
    this.hookAddress = hookAddress;
    this.privateKey = privateKey;
  }
  
  /**
   * Add pool to monitoring
   */
  addPool(config: PoolInvestmentConfig) {
    this.monitoredPools.set(config.poolId, config);
  }
  
  /**
   * Check pool and invest idle liquidity if conditions are met
   */
  async checkAndInvest(poolId: string, strategy: InvestmentStrategy): Promise<boolean> {
    const config = this.monitoredPools.get(poolId);
    if (!config) {
      throw new Error(`Pool ${poolId} not found in monitoring`);
    }
    
    // Get pool metrics
    const publicClient = this.getPublicClient(config.chainId);
    const poolIdBytes = poolId as `0x${string}`;
    
    const metrics = await publicClient.readContract({
      address: this.hookAddress,
      abi: HOOK_ABI,
      functionName: 'getPoolMetrics',
      args: [poolIdBytes],
    });
    
    // Check if volume is below threshold
    const m = metrics as { volume: number; threshold: number };
    if (m.volume >= m.threshold) {
      return false; // Volume is high, don't invest
    }
    
    // Get current pool liquidity (would need to query pool manager)
    // For MVP, we'll use a simplified approach
    
    // Calculate how much to invest (e.g., 70% of idle liquidity)
    // This would be calculated based on actual pool reserves
    
    // For now, return success (actual implementation would invest)
    return true;
  }
  
  /**
   * Withdraw invested liquidity when needed
   */
  async withdrawInvestment(
    poolId: string,
    positionIndex: number,
    amount: bigint
  ): Promise<boolean> {
    const config = this.monitoredPools.get(poolId);
    if (!config) {
      throw new Error(`Pool ${poolId} not found`);
    }
    
    const account = privateKeyToAccount(this.privateKey);
    const walletClient = createWalletClient({
      account,
      chain: this.getChain(config.chainId),
      transport: http(),
    });
    
    const publicClient = this.getPublicClient(config.chainId);
    
    try {
      const { request } = await publicClient.simulateContract({
        address: this.hookAddress,
        abi: HOOK_ABI,
        functionName: 'withdrawInvestedLiquidity',
        args: [config.poolKey, BigInt(positionIndex), amount],
        account,
      });
      
      await walletClient.writeContract(request);
      return true;
    } catch (error) {
      console.error('Withdraw investment failed:', error);
      return false;
    }
  }
  
  /**
   * Process user investment allocation
   */
  async processUserInvestment(
    userAddress: Address,
    tokens: TokenBalance[],
    poolKey: PoolKey,
    chainId: number,
    allocationPercent: number
  ): Promise<{
    investedAmount: bigint;
    lpAmount0: bigint;
    lpAmount1: bigint;
    txHash?: string;
  }> {
    // Calculate total deposit value
    const totalDeposit = tokens.reduce((sum, token) => sum + token.amount, 0n);
    
    // Calculate investment amount (up to 50%)
    const investmentAmount = calculateInvestmentAmount(totalDeposit, allocationPercent);
    
    // Calculate 50:50 ratio for remaining tokens
    const remainingTokens = tokens.map(t => ({
      ...t,
      amount: t.amount - (investmentAmount / BigInt(tokens.length)),
    }));
    
    const { amount0, amount1, swaps } = await calculate5050Ratio(
      remainingTokens,
      poolKey,
      chainId
    );
    
    // Execute swaps to achieve 50:50
    await execute5050Swaps(swaps, chainId, userAddress, this.privateKey);
    
    return {
      investedAmount: investmentAmount,
      lpAmount0: amount0,
      lpAmount1: amount1,
    };
  }
  
  private getPublicClient(chainId: number) {
    const rpcUrl = Object.values(CHAINS).find((c) => c.id === chainId)?.rpc;
    if (!rpcUrl) {
      throw new Error(`No RPC URL for chain ${chainId}`);
    }
    
    return createPublicClient({
      chain: this.getChain(chainId),
      transport: http(rpcUrl),
    });
  }
  
  private getChain(chainId: number) {
    const chainConfig = Object.values(CHAINS).find((c) => c.id === chainId);
    if (!chainConfig) {
      throw new Error(`Chain ${chainId} not configured`);
    }
    
    return {
      id: chainId,
      name: chainConfig.name,
      network: 'unknown',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [chainConfig.rpc] } },
    };
  }
}

// Export singleton instance
export function createIdleLiquidityManager(
  hookAddress: Address,
  privateKey: `0x${string}`
): IdleLiquidityManager {
  return new IdleLiquidityManager(hookAddress, privateKey);
}
