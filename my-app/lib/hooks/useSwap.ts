'use client';

import { useCallback } from 'react';
import { parseUnits } from 'viem';
import { useWriteContract, useAccount } from 'wagmi';
import { erc20Abi } from '@/lib/abis/erc20';
import { v4RouterAbi } from '@/lib/abis/v4-router';
import { basketSwapperAbi } from '@/lib/abis/basket-swapper';
import {
  CHAIN_ID,
  HOOKS_ADDRESS,
  POOL_FEE,
  TICK_SPACING,
  V4_SWAP_ROUTER_ADDRESS,
  BASKET_SWAPPER_ADDRESS,
  getPoolKey,
  tokenAddress,
  type PoolKeyStruct,
} from '@/lib/constants/swap';
import { getTokenBySymbol } from '@/lib/constants/tokens';
import { getQuoteForPath } from '@/lib/services/quote';
import { getPathForPair, isMultiHop } from '@/lib/services/swap-path';

// App quote uses constant prices; real AMM output can be lower (0.3% fee + curve).
// 20% slippage so swaps go through on testnet pools.
const SLIPPAGE_BPS = 2000;
const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

function amountOutMinWithSlippage(quote: string, decimals: number, slippageBps: number): bigint {
  const q = parseFloat(quote);
  if (!Number.isFinite(q) || q <= 0) return 0n;
  const min = (q * (10000 - slippageBps)) / 10000;
  const decimalsToUse = Math.min(decimals, 18);
  const minStr = min.toFixed(decimalsToUse);
  return parseUnits(minStr, decimals);
}

function pathToPathKeys(path: string[]): {
  intermediateCurrency: `0x${string}`;
  fee: number;
  tickSpacing: number;
  hooks: `0x${string}`;
  hookData: `0x${string}`;
}[] {
  const keys: {
    intermediateCurrency: `0x${string}`;
    fee: number;
    tickSpacing: number;
    hooks: `0x${string}`;
    hookData: `0x${string}`;
  }[] = [];
  for (let i = 1; i < path.length; i++) {
    const addr = tokenAddress(path[i]);
    if (!addr) break;
    keys.push({
      intermediateCurrency: addr,
      fee: POOL_FEE,
      tickSpacing: TICK_SPACING,
      hooks: HOOKS_ADDRESS,
      hookData: '0x' as `0x${string}`,
    });
  }
  return keys;
}

export function useSwap() {
  const { address: receiver, chain } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const isCorrectChain = chain?.id === CHAIN_ID;

  /**
   * Execute a single swap (one input token → one output token).
   * Approval (1 wallet prompt) + swap (1 wallet prompt).
   */
  const executeSingleSwap = useCallback(
    async (params: {
      inputSymbol: string;
      inputAmount: string;
      outputSymbol: string;
    }): Promise<{ hash: `0x${string}` }> => {
      if (!receiver) throw new Error('Wallet not connected');
      if (!isCorrectChain) throw new Error('Please switch to Base Sepolia');

      const { path } = getPathForPair(params.inputSymbol, params.outputSymbol, params.inputAmount);
      const inputToken = getTokenBySymbol(params.inputSymbol);
      const outputToken = getTokenBySymbol(params.outputSymbol);
      if (
        !inputToken?.address ||
        !outputToken?.address ||
        inputToken.address.startsWith('0x0000') ||
        outputToken.address.startsWith('0x0000')
      ) {
        throw new Error('Token not supported on this chain');
      }

      const amountInRaw = parseUnits(params.inputAmount, inputToken.decimals);
      const quoted = getQuoteForPath(path, params.inputAmount);
      const amountOutMin = amountOutMinWithSlippage(quoted, outputToken.decimals, SLIPPAGE_BPS);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      const tokenAddr = inputToken.address as `0x${string}`;

      // Approve router (max, one-time per token)
      await writeContractAsync({
        abi: erc20Abi,
        address: tokenAddr,
        functionName: 'approve',
        args: [V4_SWAP_ROUTER_ADDRESS, MAX_UINT256],
      });

      // Execute swap
      if (isMultiHop({ fromSymbol: params.inputSymbol, toSymbol: params.outputSymbol, path })) {
        const startCurrency = tokenAddress(path[0]);
        if (!startCurrency) throw new Error('Invalid path');
        const pathKeys = pathToPathKeys(path);
        const hash = await writeContractAsync({
          abi: v4RouterAbi,
          address: V4_SWAP_ROUTER_ADDRESS,
          functionName: 'swapExactTokensForTokens',
          args: [amountInRaw, amountOutMin, startCurrency, pathKeys, receiver, deadline],
        });
        return { hash: hash! };
      }

      const poolKey = getPoolKey(path[0], path[1]);
      if (!poolKey) throw new Error('No pool for this pair');
      const zeroForOne =
        (poolKey as PoolKeyStruct).currency0.toLowerCase() === inputToken.address.toLowerCase();

      const hash = await writeContractAsync({
        abi: v4RouterAbi,
        address: V4_SWAP_ROUTER_ADDRESS,
        functionName: 'swapExactTokensForTokens',
        args: [amountInRaw, amountOutMin, zeroForOne, poolKey, '0x' as `0x${string}`, receiver, deadline],
      });
      return { hash: hash! };
    },
    [receiver, isCorrectChain, writeContractAsync],
  );

  /**
   * Basket swap: multiple input tokens → one output token in ONE transaction.
   *
   * Uses the on-chain BasketSwapper contract which:
   *   1. Pulls every input token from the user
   *   2. Approves the router internally
   *   3. Calls swapExactTokensForTokens for each sub-swap
   *   all inside a single transaction.
   *
   * The YieldOptimizerHook's beforeSwap/afterSwap fires for every sub-swap
   * because each goes through a pool that has the hook attached.
   *
   * From the user's perspective:
   *   - N approval prompts (one per unique input token, max so one-time)
   *   - 1 swap prompt (the basketSwap call)
   */
  const executeBasketSwaps = useCallback(
    async (
      inputs: Array<{ symbol: string; amount: string }>,
      outputSymbol: string,
    ): Promise<{ hashes: `0x${string}`[] }> => {
      if (!receiver) throw new Error('Wallet not connected');
      if (!isCorrectChain) throw new Error('Please switch to Base Sepolia');

      if (BASKET_SWAPPER_ADDRESS.startsWith('0x0000')) {
        throw new Error('BasketSwapper not deployed yet — deploy with 05_DeployBasketSwapper.s.sol and update BASKET_SWAPPER_ADDRESS');
      }

      const outputToken = getTokenBySymbol(outputSymbol);
      if (!outputToken?.address || outputToken.address.startsWith('0x0000')) {
        throw new Error('Output token not supported');
      }

      const validInputs = inputs.filter((i) => i.symbol && i.amount && parseFloat(i.amount) > 0);
      if (validInputs.length === 0) throw new Error('No valid inputs');

      // If only one input, fall back to a normal single swap (cheaper)
      if (validInputs.length === 1) {
        const { hash } = await executeSingleSwap({
          inputSymbol: validInputs[0].symbol,
          inputAmount: validInputs[0].amount,
          outputSymbol,
        });
        return { hashes: [hash] };
      }

      // Step 1: Approve BasketSwapper for each unique input token (max, one-time)
      const seenTokens = new Set<string>();
      for (const input of validInputs) {
        const inputToken = getTokenBySymbol(input.symbol);
        if (!inputToken?.address || inputToken.address.startsWith('0x0000')) {
          throw new Error(`Token ${input.symbol} not supported`);
        }
        const addr = inputToken.address.toLowerCase();
        if (!seenTokens.has(addr)) {
          seenTokens.add(addr);
          await writeContractAsync({
            abi: erc20Abi,
            address: inputToken.address as `0x${string}`,
            functionName: 'approve',
            args: [BASKET_SWAPPER_ADDRESS as `0x${string}`, MAX_UINT256],
          });
        }
      }

      // Step 2: Build the SwapInput[] array for the contract
      const swapInputs: {
        token: `0x${string}`;
        amountIn: bigint;
        amountOutMin: bigint;
        zeroForOne: boolean;
        poolKey: {
          currency0: `0x${string}`;
          currency1: `0x${string}`;
          fee: number;
          tickSpacing: number;
          hooks: `0x${string}`;
        };
      }[] = [];

      for (const input of validInputs) {
        const inputToken = getTokenBySymbol(input.symbol)!;
        const amountInRaw = parseUnits(input.amount, inputToken.decimals);

        // BasketSwapper uses direct single-pool swaps only.
        // Look for the direct pool between input and output token.
        const poolKey = getPoolKey(input.symbol, outputSymbol);
        if (!poolKey) {
          throw new Error(
            `No direct pool for ${input.symbol} → ${outputSymbol}. Basket swaps require a direct pool for every input token.`,
          );
        }

        // Quote via the direct 2-hop path
        const directPath = [input.symbol.toUpperCase(), outputSymbol.toUpperCase()];
        const quoted = getQuoteForPath(directPath, input.amount);
        const amountOutMin = amountOutMinWithSlippage(quoted, outputToken.decimals, SLIPPAGE_BPS);

        const zeroForOne =
          (poolKey as PoolKeyStruct).currency0.toLowerCase() === inputToken.address.toLowerCase();

        swapInputs.push({
          token: inputToken.address as `0x${string}`,
          amountIn: amountInRaw,
          amountOutMin,
          zeroForOne,
          poolKey: poolKey as {
            currency0: `0x${string}`;
            currency1: `0x${string}`;
            fee: number;
            tickSpacing: number;
            hooks: `0x${string}`;
          },
        });
      }

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      // Step 3: ONE transaction — basketSwap
      const hash = await writeContractAsync({
        abi: basketSwapperAbi,
        address: BASKET_SWAPPER_ADDRESS as `0x${string}`,
        functionName: 'basketSwap',
        args: [swapInputs, receiver, deadline],
      });

      return { hashes: [hash!] };
    },
    [receiver, isCorrectChain, writeContractAsync, executeSingleSwap],
  );

  return {
    executeSingleSwap,
    executeBasketSwaps,
    isCorrectChain,
    isConnected: !!receiver,
  };
}
