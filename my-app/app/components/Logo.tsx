'use client';

import React from 'react';

/** Clean wordmark + icon: no external images, SVG only */
export default function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-violet-600 shadow-md shadow-blue-500/25 ring-1 ring-white/10">
        <span className="text-white font-bold text-lg leading-none tracking-tighter" aria-hidden>
          A
        </span>
      </div>
      <div>
        <span className="block text-base font-semibold tracking-tight text-white">
          Archimedes
        </span>
        <span className="block text-[10px] font-medium uppercase tracking-wider text-zinc-400">
          DeFi on Base
        </span>
      </div>
    </div>
  );
}
