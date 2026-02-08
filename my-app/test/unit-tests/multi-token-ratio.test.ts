/**
 * Multi-Token 50:50 Ratio Calculation Tests
 * Test the logic for achieving 50:50 ratio from multiple tokens
 */

import { describe, it, expect } from '@jest/globals';
import { calculate5050Ratio, TokenBalance, calculateInvestmentAmount } from '../../lib/services/idle-liquidity-manager';
import { Address } from 'viem';

describe('50:50 Ratio Calculation', () => {
  const mockPoolKey = {
    currency0: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address, // USDC
    currency1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address, // WETH
    fee: 3000,
    tickSpacing: 60,
    hooks: '0x0000000000000000000000000000000000000000' as Address,
  };

  it('should handle tokens that are already pool currencies', async () => {
    const tokens: TokenBalance[] = [
      {
        token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address, // USDC
        amount: BigInt('1000000000'), // 1000 USDC (6 decimals)
      },
      {
        token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address, // WETH
        amount: BigInt('500000000000000000'), // 0.5 WETH (18 decimals)
      },
    ];

    const result = await calculate5050Ratio(tokens, mockPoolKey, 1);
    
    // Should have both currencies
    expect(result.amount0).toBeGreaterThan(0n);
    expect(result.amount1).toBeGreaterThan(0n);
    
    console.log('Result:', {
      amount0: result.amount0.toString(),
      amount1: result.amount1.toString(),
      swaps: result.swaps.length,
    });
  });

  it('should swap excess currency0 to currency1', async () => {
    const tokens: TokenBalance[] = [
      {
        token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address, // USDC
        amount: BigInt('2000000000'), // 2000 USDC
      },
      {
        token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address, // WETH
        amount: BigInt('100000000000000000'), // 0.1 WETH (imbalanced)
      },
    ];

    const result = await calculate5050Ratio(tokens, mockPoolKey, 1);
    
    // Should have swaps to balance
    expect(result.swaps.length).toBeGreaterThan(0);
    
    console.log('Imbalanced tokens result:', {
      amount0: result.amount0.toString(),
      amount1: result.amount1.toString(),
      swaps: result.swaps,
    });
  });

  it('should handle tokens that need to be swapped to pool currencies', async () => {
    const tokens: TokenBalance[] = [
      {
        token: '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address, // USDT
        amount: BigInt('1000000000'), // 1000 USDT
      },
      {
        token: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' as Address, // WBTC
        amount: BigInt('10000000'), // 0.1 WBTC (8 decimals)
      },
    ];

    const result = await calculate5050Ratio(tokens, mockPoolKey, 1);
    
    // Should have swaps to convert to pool currencies
    expect(result.swaps.length).toBeGreaterThan(0);
    
    console.log('External tokens result:', {
      amount0: result.amount0.toString(),
      amount1: result.amount1.toString(),
      swaps: result.swaps,
    });
  });

  it('should handle empty token array', async () => {
    const tokens: TokenBalance[] = [];

    const result = await calculate5050Ratio(tokens, mockPoolKey, 1);
    
    expect(result.amount0).toBe(0n);
    expect(result.amount1).toBe(0n);
    expect(result.swaps.length).toBe(0);
  });

  it('should handle single token', async () => {
    const tokens: TokenBalance[] = [
      {
        token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address, // USDC
        amount: BigInt('1000000000'), // 1000 USDC
      },
    ];

    const result = await calculate5050Ratio(tokens, mockPoolKey, 1);
    
    // Should swap half to currency1
    expect(result.swaps.length).toBeGreaterThan(0);
    
    console.log('Single token result:', {
      amount0: result.amount0.toString(),
      amount1: result.amount1.toString(),
      swaps: result.swaps,
    });
  });
});

describe('Investment Amount Calculation', () => {
  it('should calculate 30% investment correctly', () => {
    const totalDeposit = BigInt('1000000000000000000'); // 1 ETH (18 decimals)
    const allocation = 3000; // 30%
    
    const investment = calculateInvestmentAmount(totalDeposit, allocation);
    
    expect(investment).toBe(BigInt('300000000000000000')); // 0.3 ETH
  });

  it('should cap at 50%', () => {
    const totalDeposit = BigInt('1000000000000000000');
    const allocation = 7000; // 70% - should cap at 50%
    
    const investment = calculateInvestmentAmount(totalDeposit, allocation);
    
    expect(investment).toBe(BigInt('500000000000000000')); // 0.5 ETH (50%)
  });

  it('should handle 0% allocation', () => {
    const totalDeposit = BigInt('1000000000000000000');
    const allocation = 0;
    
    const investment = calculateInvestmentAmount(totalDeposit, allocation);
    
    expect(investment).toBe(0n);
  });
});
