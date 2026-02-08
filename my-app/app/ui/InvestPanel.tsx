'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { PoolRef } from '@/lib/types/pools';
import { Button, Card, Input, Badge } from '@/app/components/ui';

type TokenRow = { symbol: string; address: `0x${string}`; amount: string; decimals: number };

function defaultTokensForBase(): TokenRow[] {
  return [
    { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', amount: '1000', decimals: 6 },
    { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', amount: '0.1', decimals: 18 },
    { symbol: 'DAI', address: '0x50c5725949A6F0c72E6C4a641F24049A917E0dAb', amount: '500', decimals: 18 },
  ];
}

function toBaseUnits(amount: string, decimals: number): string {
  // minimal safe conversion for demo; replace with viem parseUnits on the server for production
  const [i, f = ''] = amount.split('.');
  const frac = (f + '0'.repeat(decimals)).slice(0, decimals);
  const normalized = `${i}${frac}`.replace(/^0+/, '') || '0';
  return normalized;
}

export interface InvestPanelProps {
  selectedPoolId?: string | null;
}

export default function InvestPanel({ selectedPoolId: propSelectedPoolId }: InvestPanelProps = {}) {
  const [selectedPool, setSelectedPool] = useState<PoolRef | null>(null);
  const [allocationBps, setAllocationBps] = useState(3000); // 30%
  const [userAddress, setUserAddress] = useState<`0x${string}`>('0x0000000000000000000000000000000000000000');
  const [tokens, setTokens] = useState<TokenRow[]>(defaultTokensForBase());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  useEffect(() => {
    const id = propSelectedPoolId || window.localStorage.getItem('archimedes:selectedPoolId');
    if (!id) return;
    // fetch pools and match by id
    (async () => {
      const res = await fetch('/api/pools?chainId=8453&limit=10');
      const json = await res.json();
      const pools: PoolRef[] = json.pools || [];
      const found = pools.find((p) => p.id === id) || null;
      setSelectedPool(found);
    })();
  }, []);

  const totalTokens = useMemo(() => tokens.filter((t) => t.amount && Number(t.amount) > 0), [tokens]);

  async function invest() {
    if (!selectedPool) {
      setResult({ error: 'Select a pool first (left panel).' });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const body = {
        action: 'process_investment',
        userAddress,
        chainId: selectedPool.chainId,
        allocationPercent: allocationBps,
        poolKey: {
          currency0: selectedPool.pair.token0.address,
          currency1: selectedPool.pair.token1.address,
          fee: Math.round(selectedPool.feeBps * 100), // rough mapping; tune later
          tickSpacing: 60,
          hooks: (process.env.NEXT_PUBLIC_V4_HOOK_ADDRESS ||
            '0x0000000000000000000000000000000000000000') as `0x${string}`,
        },
        tokens: totalTokens.map((t) => ({
          token: t.address,
          amount: BigInt(toBaseUnits(t.amount, t.decimals)).toString(),
          symbol: t.symbol,
        })),
      };

      const res = await fetch('/api/investment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Investment error');
      setResult(json);
    } catch (e: unknown) {
      setResult({ error: e instanceof Error ? e.message : 'Investment error' });
    } finally {
      setLoading(false);
    }
  }

  function updateToken(idx: number, patch: Partial<TokenRow>) {
    setTokens((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }

  function addRow() {
    setTokens((prev) => [
      ...prev,
      { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', amount: '100', decimals: 6 },
    ]);
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <Card className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Target pool</div>
            <div className="mt-1 text-sm font-semibold">
              {selectedPool ? `${selectedPool.pair.token0.symbol}/${selectedPool.pair.token1.symbol}` : 'None selected'}
            </div>
            <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              {selectedPool ? `${selectedPool.apr.toFixed(1)}% APR · Uniswap ${selectedPool.version}` : 'Pick a pool from the left panel.'}
            </div>
          </div>
          <Badge>{allocationBps / 100}% automated</Badge>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3">
        <div className="text-sm font-semibold">Your tokens (same network)</div>
        {tokens.map((t, idx) => (
          <div
            key={`${t.symbol}-${idx}`}
            className="grid grid-cols-[1fr_1fr_1fr] gap-2 rounded-2xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-zinc-950"
          >
            <Input value={t.symbol} onChange={(e) => updateToken(idx, { symbol: e.target.value })} placeholder="Symbol" />
            <Input
              value={t.address}
              onChange={(e) => updateToken(idx, { address: e.target.value as `0x${string}` })}
              placeholder="Token address"
            />
            <Input value={t.amount} onChange={(e) => updateToken(idx, { amount: e.target.value })} placeholder="Amount" />
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={addRow}>
            Add token
          </Button>
          <Button
            variant="ghost"
            onClick={() => setTokens(defaultTokensForBase())}
          >
            Reset
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="text-sm font-semibold">Automated allocation (0–50%)</div>
        <div className="grid grid-cols-[1fr_140px] items-center gap-3">
          <input
            type="range"
            min={0}
            max={5000}
            step={100}
            value={allocationBps}
            onChange={(e) => setAllocationBps(Number(e.target.value))}
            className="w-full"
          />
          <Input
            value={(allocationBps / 100).toFixed(0)}
            onChange={(e) => setAllocationBps(Math.max(0, Math.min(5000, Number(e.target.value) * 100)))}
            placeholder="30"
          />
        </div>
        <div className="text-xs text-zinc-600 dark:text-zinc-400">
          Example: 30% means up to 30% of your deposit is managed by the backend’s automated strategies.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="text-sm font-semibold">User address (demo)</div>
        <Input value={userAddress} onChange={(e) => setUserAddress(e.target.value as `0x${string}`)} />
        <div className="text-xs text-zinc-600 dark:text-zinc-400">
          For now this is just a placeholder. When we add wagmi, this becomes “Connect wallet”.
        </div>
      </div>

      <Button onClick={invest} disabled={loading}>
        {loading ? 'Preparing…' : 'Invest'}
      </Button>

      {result ? (
        <Card className="p-4">
          <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Result</div>
          <pre className="mt-2 overflow-auto rounded-xl bg-zinc-50 p-3 text-xs text-zinc-800 dark:bg-black dark:text-zinc-200">
            {JSON.stringify(result, null, 2)}
          </pre>
        </Card>
      ) : null}
    </div>
  );
}

