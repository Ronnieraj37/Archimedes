'use client';

import React, { useState, useEffect } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { findPools, getDashboardStats } from '@/lib/services/pools';
import type { PoolRef } from '@/lib/types/pools';
import DashboardStats from './components/DashboardStats';
import PoolCard from './components/PoolCard';
import ChatPanel from './components/ChatPanel';
import GetTokens from './components/GetTokens';
import SwapInterface from './components/SwapInterface';
import InvestPanel from './ui/InvestPanel';
import Logo from './components/Logo';
import type { AgentIntentSwap } from '@/lib/types/agent';

type Section = 'home' | 'pools' | 'swap';

const TAGLINES = [
  'Swap, add liquidity, and manage yield with one assistant.',
  'Ask in plain language. Get pools, routes, and transactions.',
  'Multi-token baskets and Uniswap v4 on Base.',
];

export default function Home() {
  const [section, setSection] = useState<Section>('home');
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [pools, setPools] = useState<PoolRef[]>([]);
  const [stats, setStats] = useState({
    totalTVL: 0,
    totalVolume24h: 0,
    totalPools: 0,
    avgAPR: 0,
  });
  const [sortBy, setSortBy] = useState<'apr' | 'tvl' | 'volume24h'>('apr');
  const [mounted, setMounted] = useState(false);
  const [taglineIndex, setTaglineIndex] = useState(0);
  const [initialSwapIntent, setInitialSwapIntent] = useState<AgentIntentSwap | null>(null);
  const [getTokensModalOpen, setGetTokensModalOpen] = useState(false);

  const handleSwapIntentFromChat = React.useCallback((intent: AgentIntentSwap) => {
    setSection('swap');
    setInitialSwapIntent(intent);
  }, []);

  const handleMintTokensFromChat = React.useCallback(() => {
    setSection('swap');
    setGetTokensModalOpen(true);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (section === 'pools' || section === 'home') {
      const basePools = findPools({ chainId: 8453, limit: 20, sortBy });
      setPools(basePools);
      setStats(getDashboardStats(8453));
    }
  }, [section, sortBy]);

  useEffect(() => {
    const t = setInterval(() => {
      setTaglineIndex((i) => (i + 1) % TAGLINES.length);
    }, 4000);
    return () => clearInterval(t);
  }, []);

  const selectedPool = pools.find((p) => p.id === selectedPoolId) ?? null;
  const topPools = pools.slice(0, 6);

  const navItems: { id: Section; label: string; icon: string }[] = [
    { id: 'home', label: 'Home', icon: '🏠' },
    { id: 'pools', label: 'Pools', icon: '🏊' },
    { id: 'swap', label: 'Swap', icon: '💱' },
  ];

  return (
    <div className="flex h-screen bg-[#0c0c0c] text-zinc-50 overflow-hidden">
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(59,130,246,0.12),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_80%_40%,rgba(139,92,246,0.08),transparent_45%)]" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-zinc-700/50 to-transparent" />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        <header
          className={`border-b border-zinc-800/60 bg-[#0c0c0c]/90 backdrop-blur-md shrink-0 transition-opacity duration-300 ${mounted ? 'opacity-100' : 'opacity-0'}`}
        >
          <div className="mx-auto max-w-5xl px-4 sm:px-5 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <Logo />
              <nav className="flex items-center gap-0.5 p-0.5 rounded-xl bg-zinc-900/70 border border-zinc-800/60">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSection(item.id);
                      if (item.id !== 'pools') setSelectedPoolId(null);
                    }}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                      section === item.id
                        ? 'bg-blue-600/25 text-blue-200 border border-blue-500/30 shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-transparent'
                    }`}
                  >
                    <span className="text-base leading-none">{item.icon}</span>
                    <span className="hidden sm:inline">{item.label}</span>
                  </button>
                ))}
              </nav>
              <ConnectButton />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto max-w-5xl px-4 sm:px-5 py-4">
            {section === 'home' && (
              <section className="animate-fade-in space-y-6">
                {/* Hero: scrolling tagline */}
                <div className="relative overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-900/40 backdrop-blur-sm px-4 py-3 min-h-[52px] flex items-center justify-center">
                  <p
                    key={taglineIndex}
                    className="text-center text-sm sm:text-base text-zinc-300 font-medium animate-fade-in"
                    style={{ animationDuration: '0.4s' }}
                  >
                    {TAGLINES[taglineIndex]}
                  </p>
                </div>

                {/* Stats */}
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                    Base network
                  </h2>
                  <DashboardStats {...stats} />
                </div>

                {/* Top Pools – showcase */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Top pools
                    </h2>
                    <button
                      type="button"
                      onClick={() => setSection('pools')}
                      className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      View all →
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {topPools.map((pool, idx) => (
                      <PoolCard
                        key={pool.id}
                        pool={pool}
                        isSelected={pool.id === selectedPoolId}
                        onClick={() =>
                          setSelectedPoolId(selectedPoolId === pool.id ? null : pool.id)
                        }
                        index={idx}
                      />
                    ))}
                  </div>
                </div>

                {/* Swap CTA */}
                <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 backdrop-blur-sm p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-zinc-100 mb-1">
                      Swap or add liquidity
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Single or multi-token baskets. Uniswap v4 on Base.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSection('swap')}
                    className="w-full sm:w-auto rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 hover:from-blue-500 hover:to-violet-500 transition-all shrink-0"
                  >
                    Open Swap →
                  </button>
                </div>

                {selectedPool && (
                  <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 backdrop-blur-sm p-4 animate-fade-in">
                    <h3 className="text-sm font-semibold text-zinc-100 mb-2">
                      Invest — {selectedPool.pair.token0.symbol}/{selectedPool.pair.token1.symbol}
                    </h3>
                    <InvestPanel selectedPoolId={selectedPoolId} />
                  </div>
                )}
              </section>
            )}

            {section === 'pools' && (
              <section className="animate-fade-in space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-zinc-100">Top Pools</h2>
                  <div className="flex gap-1.5">
                    {(['apr', 'tvl', 'volume24h'] as const).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSortBy(key)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          sortBy === key
                            ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                            : 'bg-zinc-900/60 text-zinc-400 border border-zinc-800/60 hover:bg-zinc-800/60'
                        }`}
                      >
                        {key === 'apr' ? 'APR' : key === 'tvl' ? 'TVL' : 'Volume'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {pools.map((pool, idx) => (
                    <PoolCard
                      key={pool.id}
                      pool={pool}
                      isSelected={pool.id === selectedPoolId}
                      onClick={() =>
                        setSelectedPoolId(selectedPoolId === pool.id ? null : pool.id)
                      }
                      index={idx}
                    />
                  ))}
                </div>
                {selectedPool && (
                  <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 backdrop-blur-sm p-4 animate-fade-in">
                    <h3 className="text-sm font-semibold text-zinc-100 mb-2">
                      Invest — {selectedPool.pair.token0.symbol}/{selectedPool.pair.token1.symbol}
                    </h3>
                    <InvestPanel selectedPoolId={selectedPoolId} />
                  </div>
                )}
              </section>
            )}

            {section === 'swap' && (
              <section className="animate-fade-in flex flex-col items-center justify-center min-h-[60vh]">
                <div className="w-full max-w-md flex flex-col items-center">
                  <div className="flex items-center justify-between gap-4 mb-4 w-full">
                    <h2 className="text-lg font-semibold text-zinc-100">Swap</h2>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setGetTokensModalOpen(true)}
                        className="text-xs font-medium text-blue-400 hover:text-blue-300 border border-blue-500/30 hover:border-blue-500/50 rounded-lg px-3 py-1.5 transition-colors"
                      >
                        Get test tokens
                      </button>
                      <p className="text-xs text-zinc-500 hidden sm:block">
                        Multi-token baskets
                      </p>
                    </div>
                  </div>
                  <SwapInterface
                    initialSwap={initialSwapIntent}
                    onInitialSwapApplied={() => setInitialSwapIntent(null)}
                    onSwap={async (basket, output) => {
                      console.log('Swap:', { basket, output });
                    }}
                  />
                </div>
                <GetTokens asModal open={getTokensModalOpen} onClose={() => setGetTokensModalOpen(false)} />
              </section>
            )}
          </div>
        </main>
      </div>

      <div className="hidden sm:flex shrink-0 h-full">
        <ChatPanel
          onSwapIntent={handleSwapIntentFromChat}
          onMintTokens={handleMintTokensFromChat}
        />
      </div>

      <MobileChatTrigger
        onSwapIntent={handleSwapIntentFromChat}
        onMintTokens={handleMintTokensFromChat}
      />
    </div>
  );
}

function MobileChatTrigger({
  onSwapIntent,
  onMintTokens,
}: {
  onSwapIntent?: (intent: import('@/lib/types/agent').AgentIntentSwap) => void;
  onMintTokens?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const handleSwapIntent = React.useCallback(
    (intent: import('@/lib/types/agent').AgentIntentSwap) => {
      onSwapIntent?.(intent);
      setOpen(false);
    },
    [onSwapIntent]
  );
  const handleMintTokens = React.useCallback(() => {
    onMintTokens?.();
    setOpen(false);
  }, [onMintTokens]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="sm:hidden fixed bottom-5 right-5 z-40 flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-500/25 ring-1 ring-white/10"
        aria-label="Open AI Assistant"
      >
        <span className="text-xl">🤖</span>
      </button>
      {open && (
        <div className="sm:hidden fixed inset-0 z-50 flex flex-col bg-[#0c0c0c]">
          <div className="flex items-center justify-between border-b border-zinc-800/60 px-4 py-2.5 shrink-0">
            <span className="text-sm font-semibold text-zinc-100">Archimedes AI</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-9 h-9 rounded-lg hover:bg-zinc-800/60 flex items-center justify-center text-zinc-400"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ChatPanel embedded onSwapIntent={handleSwapIntent} onMintTokens={handleMintTokens} />
          </div>
        </div>
      )}
    </>
  );
}
