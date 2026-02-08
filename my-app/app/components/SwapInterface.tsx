'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { formatUnits } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { erc20Abi } from '@/lib/abis/erc20';
import { Button, Input } from './ui';
import { TOKENS_BASE_SEPOLIA, getTokenBySymbol, getPriceInUsdt, type TokenInfo } from '@/lib/constants/tokens';
import { useSwap } from '@/lib/hooks/useSwap';
import { getQuote, getQuoteBasket } from '@/lib/services/quote';

const BASE_TOKENS = TOKENS_BASE_SEPOLIA;

/** Format balance for display (max 6 decimals, no trailing zeros). */
function formatBalance(s: string): string {
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n === 0) return '0';
  if (n >= 1e6) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n.toFixed(6).replace(/\.?0+$/, '') || '0';
}

function TokenBalanceAndMax({
  tokenAddress,
  tokenSymbol,
  decimals,
  onMax,
}: {
  tokenAddress: string;
  tokenSymbol: string;
  decimals: number;
  onMax: (amount: string) => void;
}) {
  const { address } = useAccount();
  const { data: balanceWei, isLoading } = useReadContract({
    abi: erc20Abi,
    address: tokenAddress ? (tokenAddress as `0x${string}`) : undefined,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
  });
  const formatted =
    balanceWei != null ? formatUnits(balanceWei, decimals) : '0';
  const displayBalance = formatBalance(formatted);
  if (!address || !tokenAddress || tokenAddress.startsWith('0x0000')) return null;
  return (
    <div className="flex flex-col items-end gap-0.5 shrink-0">
      <button
        type="button"
        onClick={() => onMax(formatted)}
        className="text-xs font-semibold text-blue-400 hover:text-blue-300 py-1 px-2 rounded border border-blue-500/30 hover:border-blue-500/50 transition-colors"
      >
        Max
      </button>
      <span className="text-xs text-zinc-500">
        Balance: {isLoading ? '…' : displayBalance} {tokenSymbol}
      </span>
    </div>
  );
}

function TokenLogo({ token, className }: { token: TokenInfo; className?: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = (token.logo.startsWith('http') || token.logo.startsWith('/')) && !imgFailed;
  return (
    <>
      {showImg && (
        <img
          src={token.logo}
          alt={token.symbol}
          className={`h-5 w-5 rounded-full object-contain ${className ?? ''}`}
          onError={() => setImgFailed(true)}
        />
      )}
      {(!showImg || imgFailed) && (
        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-600 text-xs font-medium ${className ?? ''}`}>
          {token.symbol.slice(0, 1)}
        </span>
      )}
    </>
  );
}

type TokenInput = {
  symbol: string;
  address: string;
  amount: string;
  decimals: number;
};

export type InitialSwapIntent = {
  inputTokens: Array<{ symbol: string; value: string }>;
  outputToken: { symbol: string };
};

interface SwapInterfaceProps {
  onSwap?: (basket: TokenInput[], outputToken: TokenInput) => void;
  /** When set (e.g. from chat), form is pre-filled and user only needs to confirm. */
  initialSwap?: InitialSwapIntent | null;
  /** Called after initialSwap has been applied so parent can clear it. */
  onInitialSwapApplied?: () => void;
}

export default function SwapInterface({ onSwap, initialSwap, onInitialSwapApplied }: SwapInterfaceProps) {
  const [inputTokens, setInputTokens] = useState<TokenInput[]>([
    { symbol: 'USDT', address: BASE_TOKENS[0].address, amount: '100', decimals: BASE_TOKENS[0].decimals },
  ]);
  const [outputToken, setOutputToken] = useState<TokenInput>({
    symbol: 'WETH',
    address: BASE_TOKENS[2].address,
    amount: '0',
    decimals: BASE_TOKENS[2].decimals,
  });
  const [isMultiToken, setIsMultiToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [txHashes, setTxHashes] = useState<string[]>([]);
  const [swapError, setSwapError] = useState<string | null>(null);

  const { executeSingleSwap, executeBasketSwaps, isCorrectChain, isConnected } = useSwap();

  // Update estimated output when input amounts or tokens change
  useEffect(() => {
    if (isMultiToken) {
      const quoted = getQuoteBasket(
        inputTokens.map((t) => ({ symbol: t.symbol, amount: t.amount })),
        outputToken.symbol
      );
      setOutputToken((prev) => ({ ...prev, amount: quoted }));
    } else {
      const first = inputTokens[0];
      if (first?.symbol && first?.amount && outputToken.symbol) {
        const quoted = getQuote(first.symbol, first.amount, outputToken.symbol);
        setOutputToken((prev) => ({ ...prev, amount: quoted }));
      } else {
        setOutputToken((prev) => ({ ...prev, amount: '0' }));
      }
    }
  }, [inputTokens, outputToken.symbol, isMultiToken]);

  // Pre-fill from chat intent (e.g. "swap 1000 USDC to WETH")
  React.useEffect(() => {
    if (!initialSwap?.inputTokens?.length || !initialSwap?.outputToken?.symbol) return;
    const inputs: TokenInput[] = initialSwap.inputTokens.map((t) => {
      const base = BASE_TOKENS.find((x) => x.symbol.toUpperCase() === t.symbol.toUpperCase());
      return {
        symbol: t.symbol,
        address: base?.address ?? '',
        amount: t.value ?? '0',
        decimals: base?.decimals ?? 18,
      };
    });
    const outSym = initialSwap.outputToken.symbol;
    const outBase = BASE_TOKENS.find((x) => x.symbol.toUpperCase() === outSym.toUpperCase());
    setInputTokens(inputs);
    setOutputToken({
      symbol: outSym,
      address: outBase?.address ?? '',
      amount: '0',
      decimals: outBase?.decimals ?? 18,
    });
    setIsMultiToken(inputs.length > 1);
    onInitialSwapApplied?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only apply when initialSwap is set
  }, [initialSwap]);

  const addInputToken = () => {
    setInputTokens([
      ...inputTokens,
      { symbol: '', address: '', amount: '', decimals: 18 },
    ]);
  };

  const removeInputToken = (index: number) => {
    setInputTokens(inputTokens.filter((_, i) => i !== index));
  };

  const updateInputToken = (index: number, field: keyof TokenInput, value: string) => {
    const updated = [...inputTokens];
    if (field === 'symbol') {
      const token = BASE_TOKENS.find((t) => t.symbol === value);
      if (token) {
        updated[index] = {
          ...updated[index],
          symbol: token.symbol,
          address: token.address,
          decimals: token.decimals,
        };
      } else {
        updated[index] = { ...updated[index], [field]: value };
      }
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setInputTokens(updated);
  };

  const updateOutputToken = (field: keyof TokenInput, value: string) => {
    if (field === 'symbol') {
      const token = BASE_TOKENS.find((t) => t.symbol === value);
      if (token) {
        setOutputToken({
          symbol: token.symbol,
          address: token.address,
          decimals: token.decimals,
          amount: outputToken.amount,
        });
      }
    } else {
      setOutputToken({ ...outputToken, [field]: value });
    }
  };

  const handleSwap = async () => {
    if (!inputTokens.every((t) => t.symbol && t.amount && parseFloat(t.amount) > 0) || !outputToken.symbol) {
      setSwapError('Please fill in all token fields');
      return;
    }
    if (!isConnected) {
      setSwapError('Connect your wallet to swap');
      return;
    }
    if (!isCorrectChain) {
      setSwapError('Please switch to Base Sepolia');
      return;
    }

    setSwapError(null);
    setTxHashes([]);
    setLoading(true);
    try {
      const estimatedOutput = isMultiToken
        ? getQuoteBasket(
            inputTokens.map((t) => ({ symbol: t.symbol, amount: t.amount })),
            outputToken.symbol
          )
        : getQuote(inputTokens[0].symbol, inputTokens[0].amount, outputToken.symbol);
      setOutputToken((prev) => ({ ...prev, amount: estimatedOutput }));

      if (onSwap) {
        await onSwap(inputTokens, { ...outputToken, amount: estimatedOutput });
      }

      if (isMultiToken) {
        const inputs = inputTokens
          .filter((t) => t.symbol && t.amount && parseFloat(t.amount) > 0)
          .map((t) => ({ symbol: t.symbol, amount: t.amount }));
        const { hashes } = await executeBasketSwaps(inputs, outputToken.symbol);
        setTxHashes(hashes);
      } else {
        const first = inputTokens[0]!;
        const { hash } = await executeSingleSwap({
          inputSymbol: first.symbol,
          inputAmount: first.amount,
          outputSymbol: outputToken.symbol,
        });
        setTxHashes([hash]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Swap failed. Please try again.';
      setSwapError(message);
      console.error('Swap error:', error);
    } finally {
      setLoading(false);
    }
  };

  /** Total input value in USD (using USDT-pegged prices). */
  const totalInputValue = useMemo(() => {
    return inputTokens.reduce((sum, t) => {
      const amount = parseFloat(t.amount || '0');
      if (!Number.isFinite(amount) || amount <= 0 || !t.symbol) return sum;
      const price = getPriceInUsdt(t.symbol);
      return sum + amount * price;
    }, 0);
  }, [inputTokens]);

  return (
    <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 backdrop-blur-sm p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-zinc-100">Multi-Token Swap</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">Single Token</span>
          <button
            onClick={() => setIsMultiToken(!isMultiToken)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              isMultiToken ? 'bg-blue-600' : 'bg-zinc-700'
            }`}
          >
            <div
              className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                isMultiToken ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
          <span className="text-xs text-zinc-400">Multi-Token Basket</span>
        </div>
      </div>

      {/* Input Tokens */}
      <div className="space-y-2.5 mb-3">
        <div className="text-xs font-medium text-zinc-400 mb-1.5">
          {isMultiToken ? 'Input Tokens (Basket)' : 'Input Token'}
        </div>
        {inputTokens.map((token, index) => (
          <div key={index} className="flex items-center gap-2">
            <div className="flex-1 rounded-lg border border-zinc-800/60 bg-zinc-900/50 p-2.5">
              <div className="flex items-center gap-2 mb-2">
                {token.symbol && getTokenBySymbol(token.symbol) && (
                  <TokenLogo token={getTokenBySymbol(token.symbol)!} />
                )}
                <select
                  value={token.symbol}
                  onChange={(e) => updateInputToken(index, 'symbol', e.target.value)}
                  className="flex-1 bg-transparent text-zinc-100 text-sm font-medium border-none outline-none"
                >
                  <option value="">Select token</option>
                  {BASE_TOKENS.map((t) => (
                    <option key={t.symbol} value={t.symbol}>
                      {t.symbol}
                    </option>
                  ))}
                </select>
                {isMultiToken && inputTokens.length > 1 && (
                  <button
                    onClick={() => removeInputToken(index)}
                    className="text-red-400 hover:text-red-300 text-lg"
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={token.amount}
                  onChange={(e) => updateInputToken(index, 'amount', e.target.value)}
                  placeholder="0.0"
                  className="flex-1 bg-transparent border-none text-lg font-semibold text-zinc-100 p-0 focus:ring-0"
                />
                {token.symbol && token.address && (
                  <TokenBalanceAndMax
                    tokenAddress={token.address}
                    tokenSymbol={token.symbol}
                    decimals={token.decimals}
                    onMax={(amount) => updateInputToken(index, 'amount', amount)}
                  />
                )}
              </div>
            </div>
          </div>
        ))}
        {isMultiToken && (
          <Button
            onClick={addInputToken}
            variant="ghost"
            className="w-full border border-dashed border-zinc-700 text-zinc-400 hover:text-zinc-300 hover:border-zinc-600"
          >
            + Add Another Token
          </Button>
        )}
      </div>

      {/* Swap Arrow */}
      <div className="flex justify-center my-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center text-white text-sm hover:scale-105 transition-transform">
          ↓
        </div>
      </div>

      {/* Output Token */}
      <div className="space-y-2 mb-4">
        <div className="text-xs font-medium text-zinc-400 mb-1">Output Token</div>
        <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/50 p-2.5">
          <div className="flex items-center gap-2 mb-1.5">
            {outputToken.symbol && getTokenBySymbol(outputToken.symbol) && (
              <TokenLogo token={getTokenBySymbol(outputToken.symbol)!} />
            )}
            <select
              value={outputToken.symbol}
                  onChange={(e) => updateOutputToken('symbol', e.target.value)}
                  className="flex-1 bg-transparent text-zinc-100 text-sm font-medium border-none outline-none"
                >
                  <option value="">Select token</option>
                  {BASE_TOKENS.map((t) => (
                    <option key={t.symbol} value={t.symbol}>
                      {t.symbol}
                    </option>
                  ))}
                </select>
          </div>
          <Input
            type="number"
            value={outputToken.amount}
            onChange={(e) => updateOutputToken('amount', e.target.value)}
            placeholder="0.0"
            className="bg-transparent border-none text-lg font-semibold text-zinc-100 p-0 focus:ring-0"
            readOnly
          />
        </div>
      </div>

      {/* Swap Info */}
      <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/50 p-3 mb-3 space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-zinc-400">Total Input</span>
          <span className="text-zinc-200 font-medium">
            ${totalInputValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-zinc-400">Estimated Output</span>
          <span className="text-zinc-200 font-medium">
            {outputToken.amount || '0.0'} {outputToken.symbol || 'token'}
          </span>
        </div>
        {isMultiToken && (
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Basket Size</span>
            <span className="text-blue-400 font-medium">{inputTokens.length} tokens</span>
          </div>
        )}
      </div>

      {swapError && (
        <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
          {swapError}
        </div>
      )}

      {txHashes.length > 0 && (
        <div className="mb-3 p-2.5 rounded-lg bg-green-500/10 border border-green-500/20 space-y-1">
          <div className="text-sm font-medium text-green-300">
            {isMultiToken ? 'Basket swap submitted (single transaction)' : 'Swap submitted'}
          </div>
          {txHashes.map((hash) => (
            <a
              key={hash}
              href={`https://sepolia.basescan.org/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-green-200/90 truncate hover:underline"
            >
              {hash}
            </a>
          ))}
        </div>
      )}

      {/* Swap Button */}
      <Button
        onClick={handleSwap}
        disabled={
          loading ||
          !inputTokens.every((t) => t.symbol && t.amount) ||
          !outputToken.symbol ||
          !isConnected ||
          !isCorrectChain
        }
        className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-500 hover:to-purple-500 py-3 text-base font-semibold"
      >
        {!isConnected
          ? 'Connect wallet'
          : !isCorrectChain
            ? 'Switch to Base Sepolia'
            : loading
              ? 'Processing...'
              : isMultiToken
                ? 'Swap Basket'
                : 'Swap'}
      </Button>

      {isMultiToken && (
        <div className="mt-3 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <div className="text-xs text-blue-300 font-medium mb-1">Single-Transaction Basket Swap</div>
          <div className="text-xs text-blue-200/80">
            All input tokens are swapped to the output in one on-chain transaction via the BasketSwapper contract. The YieldOptimizer hook fires beforeSwap/afterSwap for each sub-swap, enabling JIT liquidity and volume tracking.
          </div>
        </div>
      )}
    </div>
  );
}
