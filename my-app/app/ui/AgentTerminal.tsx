'use client';

import React, { useMemo, useState, useCallback } from 'react';
import type { PoolRef } from '@/lib/types/pools';
import { Badge, Button, Card, Input } from '@/app/components/ui';

type AgentExecuted =
  | { action: { type: 'FIND_POOLS'; params: Record<string, unknown> }; result: { pools: PoolRef[] } }
  | { action: { type: 'INVEST'; params: Record<string, unknown> } }
  | { action: { type: 'NONE'; params?: Record<string, unknown> } };

interface AgentTerminalProps {
  onPoolSelect?: (poolId: string) => void;
  selectedPoolId?: string | null;
}

export default function AgentTerminal({ onPoolSelect, selectedPoolId }: AgentTerminalProps) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string>('');
  const [pools, setPools] = useState<PoolRef[]>([]);
  const [history, setHistory] = useState<Array<{ role: 'user' | 'agent'; content: string }>>([]);

  const selectedPool = useMemo(
    () => pools.find((p) => p.id === selectedPoolId) || null,
    [pools, selectedPoolId]
  );

  const handleQuery = useCallback(
    async (message: string) => {
      if (!message.trim() || loading) return;

      setLoading(true);
      setHistory((prev) => [...prev, { role: 'user', content: message }]);

      try {
        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message, context: { chainId: 1 } }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Agent error');

        const agentResponse = json.summary || 'No response';
        setSummary(agentResponse);
        setHistory((prev) => [...prev, { role: 'agent', content: agentResponse }]);

        const executed: AgentExecuted[] = (json.executed || []) as AgentExecuted[];
        const find = executed.find((e) => e?.action?.type === 'FIND_POOLS') as
          | { action: { type: 'FIND_POOLS' }; result: { pools: PoolRef[] } }
          | undefined;
        if (find?.result?.pools) setPools(find.result.pools);
      } catch (e: unknown) {
        const errorMsg = e instanceof Error ? e.message : 'Agent error';
        setSummary(errorMsg);
        setHistory((prev) => [...prev, { role: 'agent', content: `Error: ${errorMsg}` }]);
      } finally {
        setLoading(false);
      }
    },
    [loading]
  );

  function choose(poolId: string) {
    onPoolSelect?.(poolId);
    window.localStorage.setItem('archimedes:selectedPoolId', poolId);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Conversation History */}
      {history.length > 0 && (
        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-xl border border-zinc-800/50 bg-zinc-950/50 p-4">
          {history.map((item, idx) => (
            <div
              key={idx}
              className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  item.role === 'user'
                    ? 'bg-blue-600/20 text-blue-200'
                    : 'bg-zinc-800/50 text-zinc-300'
                }`}
              >
                {item.content}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Current Summary */}
      {summary && history.length === 0 && (
        <Card className="border-zinc-800/50 bg-zinc-950/50 p-4">
          <div className="text-xs font-semibold text-zinc-400">Agent Response</div>
          <div className="mt-1 text-sm leading-6 text-zinc-200">{summary}</div>
        </Card>
      )}

      {/* Pool Results */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-zinc-300">Recommended Pools</div>
        <Badge className="bg-zinc-800/50 text-zinc-400">Mock Data</Badge>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {pools.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800/50 p-6 text-center text-sm text-zinc-500">
            Ask for pools using the command bar below
          </div>
        ) : (
          pools.map((p) => {
            const active = p.id === selectedPoolId;
            return (
              <button
                key={p.id}
                onClick={() => choose(p.id)}
                className={`text-left rounded-xl border p-4 transition ${
                  active
                    ? 'border-blue-500/50 bg-blue-500/10'
                    : 'border-zinc-800/50 bg-zinc-950/50 hover:border-zinc-700/50 hover:bg-zinc-900/50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-100">
                      {p.pair.token0.symbol}/{p.pair.token1.symbol}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {p.dex} {p.version} · Fee {p.feeBps} bps · Chain {p.chainId}
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="text-sm font-semibold text-green-400">{p.apr.toFixed(1)}% APR</div>
                    <div className="text-xs text-zinc-500">TVL ${Math.round(p.tvlUsd / 1_000_000)}M</div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {selectedPool && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 text-sm">
          <div className="font-semibold text-blue-300">Selected Pool</div>
          <div className="mt-1 text-zinc-300">
            {selectedPool.pair.token0.symbol}/{selectedPool.pair.token1.symbol} ·{' '}
            {selectedPool.apr.toFixed(1)}% APR
          </div>
          <div className="mt-3 text-xs text-zinc-400">
            Ready to invest. Add tokens in the Investment panel.
          </div>
        </div>
      )}
    </div>
  );
}

// Command Bar Component (separate for bottom placement)
AgentTerminal.CommandBar = function CommandBar() {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || loading) return;

    setLoading(true);
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, context: { chainId: 1 } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Agent error');

      // Trigger page refresh to show results (simple approach)
      window.location.reload();
    } catch (e: unknown) {
      console.error('Command error:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-3">
      <div className="relative flex-1">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ask Archimedes: 'give the best pools in uniswap today with highest apr which has usdt'"
          className="border-zinc-800/50 bg-zinc-900/50 text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500/50"
          disabled={loading}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
          Press Enter to send
        </div>
      </div>
      <Button
        type="submit"
        disabled={loading || !message.trim()}
        className="bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-500 hover:to-purple-500"
      >
        {loading ? 'Processing...' : 'Send'}
      </Button>
    </form>
  );
};