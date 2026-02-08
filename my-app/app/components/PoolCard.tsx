'use client';

import React from 'react';
import type { PoolRef } from '@/lib/types/pools';

/** Color map for token first-letter badges. */
const TOKEN_COLORS: Record<string, string> = {
  W: 'from-blue-500 to-indigo-600',   // WETH, WBTC
  U: 'from-green-500 to-emerald-600', // USDC, USDT
  D: 'from-amber-500 to-orange-600',  // DAI
  c: 'from-cyan-500 to-teal-600',     // cbETH
  O: 'from-red-500 to-rose-600',      // OP
};

function TokenBadge({ symbol, overlap }: { symbol: string; overlap?: boolean }) {
  const letter = symbol[0] ?? '?';
  const gradient = TOKEN_COLORS[letter] ?? 'from-zinc-500 to-zinc-600';
  return (
    <div
      className={`w-7 h-7 rounded-full bg-gradient-to-br ${gradient} border-2 border-zinc-900 flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${overlap ? '-ml-2' : ''}`}
      title={symbol}
    >
      {letter}
    </div>
  );
}

interface PoolCardProps {
  pool: PoolRef;
  isSelected?: boolean;
  onClick?: () => void;
  index?: number;
}

export default function PoolCard({ pool, isSelected, onClick, index = 0 }: PoolCardProps) {
  const formatCurrency = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
  };

  return (
    <button
      onClick={onClick}
      type="button"
      className={`text-left rounded-xl border p-4 transition-all duration-200 hover-lift animate-fade-in ${
        isSelected
          ? 'border-blue-500/50 bg-blue-500/10 shadow-md shadow-blue-500/10'
          : 'border-zinc-800/60 bg-zinc-900/40 hover:border-zinc-700/60 hover:bg-zinc-800/40'
      }`}
      style={{ animationDelay: `${index * 0.03}s` }}
    >
      {/* Header: token pair + fee */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center">
          <TokenBadge symbol={pool.pair.token0.symbol} />
          <TokenBadge symbol={pool.pair.token1.symbol} overlap />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-100 truncate">
            {pool.pair.token0.symbol}/{pool.pair.token1.symbol}
          </div>
          <div className="text-[11px] text-zinc-500">{pool.feeBps / 100}% fee</div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-zinc-800/40">
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">APR</div>
          <div className="text-sm font-bold text-emerald-400">{pool.apr.toFixed(1)}%</div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">TVL</div>
          <div className="text-xs font-semibold text-zinc-300">{formatCurrency(pool.tvlUsd)}</div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">24h Vol</div>
          <div className="text-xs font-semibold text-zinc-300">{formatCurrency(pool.volume24hUsd)}</div>
        </div>
      </div>
    </button>
  );
}
