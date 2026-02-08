'use client';

import React, { useState, useEffect } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useEnsName } from 'wagmi';
import { findPools, getDashboardStats } from '@/lib/services/pools';
import type { PoolRef } from '@/lib/types/pools';
import DashboardStats from './components/DashboardStats';
import PoolCard from './components/PoolCard';
import ChatPanel from './components/ChatPanel';
import GetTokens from './components/GetTokens';
import SwapInterface from './components/SwapInterface';
import Logo from './components/Logo';
import type { AgentIntentSwap } from '@/lib/types/agent';

type Section = 'home' | 'pools' | 'swap' | 'crosschain';

function ConnectedEnsName() {
  const { address, isConnected } = useAccount();
  const { data: ensName } = useEnsName({ address, chainId: 1, query: { enabled: !!address && isConnected } });
  if (!isConnected || !address) return null;
  if (!ensName) return null;
  return (
    <span className="text-xs text-zinc-400 hidden sm:inline" title={address}>
      {ensName}
    </span>
  );
}

export default function Home() {
  const [section, setSection] = useState<Section>('home');
  const [pools, setPools] = useState<PoolRef[]>([]);
  const [stats, setStats] = useState({ totalTVL: 0, totalVolume24h: 0, totalPools: 0, avgAPR: 0 });
  const [sortBy, setSortBy] = useState<'apr' | 'tvl' | 'volume24h'>('apr');
  const [mounted, setMounted] = useState(false);
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

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (section === 'pools' || section === 'home') {
      setPools(findPools({ chainId: 8453, limit: 20, sortBy }));
      setStats(getDashboardStats(8453));
    }
  }, [section, sortBy]);

  const topPools = pools.slice(0, 6);

  const navItems: { id: Section; label: string }[] = [
    { id: 'home', label: 'Home' },
    { id: 'pools', label: 'Pools' },
    { id: 'swap', label: 'Swap' },
    { id: 'crosschain', label: 'Cross-chain' },
  ];

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-zinc-50 overflow-hidden">
      {/* Subtle background glow */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(59,130,246,0.1),transparent_60%)]" />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <header className={`border-b border-zinc-800/50 bg-[#0a0a0a]/95 backdrop-blur-md shrink-0 transition-opacity duration-300 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-2.5">
            <div className="flex items-center justify-between gap-4">
              <Logo />
              <nav className="flex items-center gap-1 p-1 rounded-lg bg-zinc-900/60 border border-zinc-800/50">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                      section === item.id
                        ? 'bg-blue-600/20 text-blue-300 border border-blue-500/25'
                        : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
              <div className="flex items-center gap-2">
                <ConnectedEnsName />
                <ConnectButton />
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6">

            {/* ==================== HOME ==================== */}
            {section === 'home' && (
              <section className="animate-fade-in space-y-8">
                {/* Hero */}
                <div className="text-center py-6">
                  <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100 mb-2">
                    Swap smarter with <span className="gradient-text">Archimedes</span>
                  </h1>
                  <p className="text-sm text-zinc-400 max-w-md mx-auto">
                    Multi-token basket swaps in one transaction. Powered by Uniswap v4 hooks on Base.
                  </p>
                  <div className="flex items-center justify-center gap-3 mt-5">
                    <button
                      type="button"
                      onClick={() => setSection('swap')}
                      className="rounded-lg bg-blue-600 hover:bg-blue-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors"
                    >
                      Start Swapping
                    </button>
                    <button
                      type="button"
                      onClick={() => setSection('pools')}
                      className="rounded-lg border border-zinc-700 hover:border-zinc-600 px-6 py-2.5 text-sm font-medium text-zinc-300 hover:text-zinc-100 transition-colors"
                    >
                      View Pools
                    </button>
                  </div>
                </div>

                {/* Stats */}
                <DashboardStats {...stats} />

                {/* Top Pools */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-zinc-300">Top Pools</h2>
                    <button
                      type="button"
                      onClick={() => setSection('pools')}
                      className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      View all
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {topPools.map((pool, idx) => (
                      <PoolCard key={pool.id} pool={pool} index={idx} />
                    ))}
                  </div>
                </div>

                {/* How it works */}
                <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-5">
                  <h2 className="text-sm font-semibold text-zinc-300 mb-4">How Basket Swaps Work</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <div className="text-blue-400 text-lg font-bold mb-1">1</div>
                      <div className="text-sm text-zinc-300 font-medium mb-0.5">Select tokens</div>
                      <div className="text-xs text-zinc-500">Add multiple input tokens and amounts.</div>
                    </div>
                    <div>
                      <div className="text-blue-400 text-lg font-bold mb-1">2</div>
                      <div className="text-sm text-zinc-300 font-medium mb-0.5">One transaction</div>
                      <div className="text-xs text-zinc-500">BasketSwapper batches all swaps atomically.</div>
                    </div>
                    <div>
                      <div className="text-blue-400 text-lg font-bold mb-1">3</div>
                      <div className="text-sm text-zinc-300 font-medium mb-0.5">Save gas</div>
                      <div className="text-xs text-zinc-500">Up to 29% gas savings vs individual swaps.</div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* ==================== POOLS ==================== */}
            {section === 'pools' && (
              <section className="animate-fade-in space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-zinc-100">Pools</h2>
                  <div className="flex gap-1.5">
                    {(['apr', 'tvl', 'volume24h'] as const).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSortBy(key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          sortBy === key
                            ? 'bg-blue-600/20 text-blue-300 border border-blue-500/25'
                            : 'bg-zinc-900/60 text-zinc-400 border border-zinc-800/50 hover:bg-zinc-800/60'
                        }`}
                      >
                        {key === 'apr' ? 'APR' : key === 'tvl' ? 'TVL' : 'Volume'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {pools.map((pool, idx) => (
                    <PoolCard key={pool.id} pool={pool} index={idx} />
                  ))}
                </div>
              </section>
            )}

            {/* ==================== SWAP ==================== */}
            {section === 'swap' && (
              <section className="animate-fade-in flex flex-col items-center justify-center min-h-[60vh]">
                <div className="w-full max-w-md">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-zinc-100">Swap</h2>
                    <button
                      type="button"
                      onClick={() => setGetTokensModalOpen(true)}
                      className="text-xs font-medium text-blue-400 hover:text-blue-300 border border-blue-500/25 hover:border-blue-500/40 rounded-lg px-3 py-1.5 transition-colors"
                    >
                      Get test tokens
                    </button>
                  </div>
                  <SwapInterface
                    initialSwap={initialSwapIntent}
                    onInitialSwapApplied={() => setInitialSwapIntent(null)}
                    onSwap={async () => {}}
                  />
                </div>
                <GetTokens asModal open={getTokensModalOpen} onClose={() => setGetTokensModalOpen(false)} />
              </section>
            )}

            {/* ==================== CROSS-CHAIN (LI.FI) ==================== */}
            {section === 'crosschain' && (
              <section className="animate-fade-in">
                <CrosschainQuotePanel />
              </section>
            )}
          </div>
        </main>
      </div>

      {/* AI Chat sidebar (desktop) */}
      <div className="hidden sm:flex shrink-0 h-full">
        <ChatPanel
          onSwapIntent={handleSwapIntentFromChat}
          onMintTokens={handleMintTokensFromChat}
        />
      </div>

      {/* Mobile chat FAB */}
      <MobileChatTrigger
        onSwapIntent={handleSwapIntentFromChat}
        onMintTokens={handleMintTokensFromChat}
      />
    </div>
  );
}

const CROSSCHAIN_CHAINS = [
  { id: 1, name: 'Ethereum' },
  { id: 8453, name: 'Base' },
] as const;

const CROSSCHAIN_TOKENS: Record<number, { address: string; symbol: string }[]> = {
  1: [
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC' },
    { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH' },
  ],
  8453: [
    { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC' },
    { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH' },
  ],
};

function CrosschainQuotePanel() {
  const { address } = useAccount();
  const [fromChain, setFromChain] = useState(8453);
  const [toChain, setToChain] = useState(1);
  const [fromToken, setFromToken] = useState(CROSSCHAIN_TOKENS[8453][0].address);
  const [toToken, setToToken] = useState(CROSSCHAIN_TOKENS[1][0].address);
  const [amount, setAmount] = useState('100');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ route: unknown; error?: string } | null>(null);

  const handleGetQuote = async () => {
    if (!address) {
      setResult({ route: null, error: 'Connect wallet first' });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const params = new URLSearchParams({
        fromChain: String(fromChain),
        toChain: String(toChain),
        fromToken,
        toToken,
        amount,
        fromAddress: address,
      });
      const res = await fetch(`/api/lifi/quote?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setResult({ route: null, error: data.error || 'Quote failed' });
        return;
      }
      setResult({ route: data.route ?? data.fullRoute, error: data.error });
    } catch (e) {
      setResult({ route: null, error: e instanceof Error ? e.message : 'Request failed' });
    } finally {
      setLoading(false);
    }
  };

  const fromTokens = CROSSCHAIN_TOKENS[fromChain as keyof typeof CROSSCHAIN_TOKENS] ?? [];
  const toTokens = CROSSCHAIN_TOKENS[toChain as keyof typeof CROSSCHAIN_TOKENS] ?? [];

  return (
    <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 backdrop-blur-sm p-4 sm:p-5 max-w-lg">
      <h2 className="text-lg font-semibold text-zinc-100 mb-1">Cross-chain quote (LI.FI)</h2>
      <p className="text-xs text-zinc-400 mb-4">
        Get a route across two EVM chains. Powered by LI.FI SDK.
      </p>
      <div className="space-y-3 mb-4">
        <div>
          <label className="text-xs text-zinc-400 block mb-1">From chain</label>
          <select
            value={fromChain}
            onChange={(e) => {
              const id = Number(e.target.value);
              setFromChain(id);
              setFromToken((CROSSCHAIN_TOKENS[id as keyof typeof CROSSCHAIN_TOKENS] ?? [])[0]?.address ?? '');
            }}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 text-zinc-100 px-3 py-2 text-sm"
          >
            {CROSSCHAIN_CHAINS.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-400 block mb-1">To chain</label>
          <select
            value={toChain}
            onChange={(e) => {
              const id = Number(e.target.value);
              setToChain(id);
              setToToken((CROSSCHAIN_TOKENS[id as keyof typeof CROSSCHAIN_TOKENS] ?? [])[0]?.address ?? '');
            }}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 text-zinc-100 px-3 py-2 text-sm"
          >
            {CROSSCHAIN_CHAINS.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-400 block mb-1">From token</label>
          <select
            value={fromToken}
            onChange={(e) => setFromToken(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 text-zinc-100 px-3 py-2 text-sm"
          >
            {fromTokens.map((t) => (
              <option key={t.address} value={t.address}>{t.symbol}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-400 block mb-1">To token</label>
          <select
            value={toToken}
            onChange={(e) => setToToken(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 text-zinc-100 px-3 py-2 text-sm"
          >
            {toTokens.map((t) => (
              <option key={t.address} value={t.address}>{t.symbol}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-400 block mb-1">Amount</label>
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 text-zinc-100 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <button
        type="button"
        onClick={handleGetQuote}
        disabled={loading || !address}
        className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2.5 text-sm font-medium"
      >
        {loading ? 'Getting quote…' : 'Get cross-chain quote'}
      </button>
      {result && (
        <div className="mt-4 p-3 rounded-lg border border-zinc-700 bg-zinc-800/30 text-sm">
          {result.error && <p className="text-amber-400">{result.error}</p>}
          {result.route != null ? (
            <pre className="text-xs text-zinc-300 overflow-auto max-h-40">
              {JSON.stringify(result.route, null, 2)}
            </pre>
          ) : null}
        </div>
      )}
    </div>
  );
}

function MobileChatTrigger({
  onSwapIntent,
  onMintTokens,
}: {
  onSwapIntent?: (intent: AgentIntentSwap) => void;
  onMintTokens?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const handleSwapIntent = React.useCallback(
    (intent: AgentIntentSwap) => {
      onSwapIntent?.(intent);
      setOpen(false);
    },
    [onSwapIntent],
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
        className="sm:hidden fixed bottom-5 right-5 z-40 flex items-center justify-center w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 transition-colors"
        aria-label="Open AI Assistant"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
      </button>
      {open && (
        <div className="sm:hidden fixed inset-0 z-50 flex flex-col bg-[#0a0a0a]">
          <div className="flex items-center justify-between border-b border-zinc-800/50 px-4 py-2.5 shrink-0">
            <span className="text-sm font-semibold text-zinc-100">Archimedes AI</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-9 h-9 rounded-lg hover:bg-zinc-800/60 flex items-center justify-center text-zinc-400"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
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
