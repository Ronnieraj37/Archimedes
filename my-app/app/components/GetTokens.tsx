'use client';

import React, { useState, useEffect } from 'react';
import { parseUnits } from 'viem';
import { useAccount, useWriteContract } from 'wagmi';
import { erc20Abi } from '@/lib/abis/erc20';
import { CHAIN_ID } from '@/lib/constants/swap';
import { TOKENS_BASE_SEPOLIA, type TokenInfo } from '@/lib/constants/tokens';
import { Button } from './ui';

/** Amounts to mint per token (human-readable). Mock tokens only — for testing. */
const MINT_AMOUNTS: Record<string, string> = {
  USDT: '10000',
  USDC: '10000',
  WETH: '5',
  WBTC: '0.05',
  DAI: '10000',
};

function isMockToken(t: TokenInfo): boolean {
  return !!t.address && !t.address.startsWith('0x0000');
}

interface GetTokensProps {
  /** When true, render as a small popup modal; when false, render inline (e.g. for embedding). */
  asModal?: boolean;
  open?: boolean;
  onClose?: () => void;
}

export default function GetTokens({ asModal = false, open = true, onClose }: GetTokensProps) {
  const { address, chain } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);

  const isBaseSepolia = chain?.id === CHAIN_ID;
  const mintableTokens = TOKENS_BASE_SEPOLIA.filter(isMockToken);

  const handleMintAll = async () => {
    if (!address || !isBaseSepolia) return;
    setError(null);
    setDone([]);
    setLoading(true);
    const succeeded: string[] = [];
    for (const token of mintableTokens) {
      try {
        const amountStr = MINT_AMOUNTS[token.symbol] ?? '1000';
        const amount = parseUnits(amountStr, token.decimals);
        await writeContractAsync({
          abi: erc20Abi,
          address: token.address as `0x${string}`,
          functionName: 'mint',
          args: [address, amount],
        });
        succeeded.push(token.symbol);
        setDone([...succeeded]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Mint failed';
        setError(`${token.symbol}: ${msg}`);
        break;
      }
    }
    setLoading(false);
  };

  const content = (
    <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/95 backdrop-blur-sm p-4 shadow-xl">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold text-zinc-100">Get test tokens</h3>
        {asModal && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-zinc-800/80 flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        )}
      </div>
      <p className="text-xs text-zinc-400 mb-3">
        Mock tokens on Base Sepolia allow anyone to mint. Use this to fund your wallet for testing.
      </p>
      {!isBaseSepolia && (
        <p className="text-sm text-amber-300/90">Switch to Base Sepolia to mint test tokens.</p>
      )}
      {isBaseSepolia && mintableTokens.length === 0 && (
        <p className="text-sm text-zinc-500">No mock token addresses configured.</p>
      )}
      {isBaseSepolia && mintableTokens.length > 0 && (
        <>
          <ul className="text-xs text-zinc-400 mb-3 space-y-0.5">
            {mintableTokens.map((t) => (
              <li key={t.symbol}>
                {t.symbol}: {MINT_AMOUNTS[t.symbol] ?? '1000'} {done.includes(t.symbol) && '✓'}
              </li>
            ))}
          </ul>
          {error && (
            <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
              {error}
            </div>
          )}
          <Button
            onClick={handleMintAll}
            disabled={!address || loading}
            className="w-full bg-zinc-700 hover:bg-zinc-600 text-white"
          >
            {!address ? 'Connect wallet' : loading ? 'Minting…' : 'Mint all tokens'}
          </Button>
        </>
      )}
    </div>
  );

  useEffect(() => {
    if (!asModal || !open || !onClose) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [asModal, open, onClose]);

  if (asModal) {
    if (!open) return null;
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="get-tokens-title"
      >
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <div className="relative w-full max-w-sm">
          {content}
        </div>
      </div>
    );
  }

  if (!isBaseSepolia) return null;
  return content;
}
