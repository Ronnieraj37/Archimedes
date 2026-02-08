'use client';

import React from 'react';
import type { PoolRef } from '@/lib/types/pools';

interface PoolCardProps {
  pool: PoolRef;
  isSelected?: boolean;
  onClick?: () => void;
  index?: number;
}

export default function PoolCard({ pool, isSelected, onClick, index = 0 }: PoolCardProps) {
  const formatCurrency = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  return (
    <button
      onClick={onClick}
      type="button"
      className={`text-left rounded-xl border p-4 transition-all duration-200 hover-lift animate-fade-in ${
        isSelected
          ? 'border-blue-500/50 bg-blue-500/10 shadow-md shadow-blue-500/15'
          : 'border-zinc-800/60 bg-zinc-900/40 hover:border-zinc-700/60 hover:bg-zinc-800/40'
      }`}
      style={{ animationDelay: `${index * 0.03}s` }}
    >
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex -space-x-1.5">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 border-2 border-zinc-900 flex items-center justify-center text-[10px] font-bold text-white">
              {pool.pair.token0.symbol[0]}
            </div>
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-600 border-2 border-zinc-900 flex items-center justify-center text-[10px] font-bold text-white">
              {pool.pair.token1.symbol[0]}
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold text-zinc-100">
              {pool.pair.token0.symbol}/{pool.pair.token1.symbol}
            </div>
            <div className="text-[11px] text-zinc-500">
              {pool.dex} · {pool.feeBps / 100}%
            </div>
          </div>
        </div>
        {isSelected && (
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse-slow" />
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-zinc-800/60">
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">APR</div>
          <div className="text-sm font-bold text-emerald-400">{pool.apr.toFixed(2)}%</div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">TVL</div>
          <div className="text-xs font-semibold text-zinc-300">{formatCurrency(pool.tvlUsd)}</div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">24h</div>
          <div className="text-xs font-semibold text-zinc-300">{formatCurrency(pool.volume24hUsd)}</div>
        </div>
      </div>
    </button>
  );
}
