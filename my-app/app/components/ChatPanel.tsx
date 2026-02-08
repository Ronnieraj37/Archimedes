'use client';

import React, { useState, useCallback } from 'react';
import { Button, Input } from './ui';

export type SwapIntentFromAgent = {
  type: 'swap';
  inputTokens: Array<{ symbol: string; value: string }>;
  outputToken: { symbol: string };
};

interface ChatPanelProps {
  /** When true, hide header/collapse (e.g. inside mobile overlay). */
  embedded?: boolean;
  /** When agent returns a swap intent, call this to navigate to Swap and pre-fill the form. */
  onSwapIntent?: (intent: SwapIntentFromAgent) => void;
  /** When user asks for test tokens / mint / faucet, call this to open the Get test tokens modal. */
  onMintTokens?: () => void;
}

/** Persistent AI chat panel – always visible, main focus of the app. */
export default function ChatPanel({ embedded, onSwapIntent, onMintTokens }: ChatPanelProps) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Array<{ role: 'user' | 'agent'; content: string }>>([]);
  const [collapsed, setCollapsed] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!message.trim() || loading) return;

      setLoading(true);
      setHistory((prev) => [...prev, { role: 'user', content: message }]);

      try {
        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message, context: { chainId: 8453 } }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Agent error');

        const data = json.data as { type: string; inputTokens?: Array<{ symbol: string; value: string }>; outputToken?: { symbol: string }; tokens?: string[]; pools?: Array<{ pair?: { token0?: { symbol?: string }; token1?: { symbol?: string } }; apr?: number }> } | undefined;
        let agentResponse = json.summary || 'No response';

        if (data?.type === 'mint_tokens') {
          onMintTokens?.();
          agentResponse = `${agentResponse}\n\nOpened Get test tokens — mint to your wallet on Base Sepolia.`;
        } else if (data?.type === 'swap' && data.inputTokens?.length && data.outputToken) {
          onSwapIntent?.({
            type: 'swap',
            inputTokens: data.inputTokens,
            outputToken: data.outputToken,
          });
          const inputStr = data.inputTokens.map((t) => `${t.value} ${t.symbol}`).join(' + ');
          const isBasket = data.inputTokens.length > 1;
          agentResponse = isBasket
            ? `${agentResponse}\n\n${inputStr} → ${data.outputToken.symbol}\nPre-filled as a basket swap — confirm on the Swap page.`
            : `${agentResponse}\n\nPre-filled on the Swap page — confirm below.`;
        } else if (data?.type === 'pool') {
          if (data.tokens?.length) agentResponse = `${agentResponse}\n\nType: pool\nTokens: ${data.tokens.join(', ')}`;
          if (data.pools?.length) {
            const list = data.pools.slice(0, 5).map((p) => `${p.pair?.token0?.symbol}/${p.pair?.token1?.symbol} ${typeof p.apr === 'number' ? p.apr.toFixed(1) + '%' : ''}`).join(' · ');
            agentResponse = `${agentResponse}\n\n${list}`;
          }
        }
        setHistory((prev) => [...prev, { role: 'agent', content: agentResponse }]);
        setMessage('');
      } catch (e: unknown) {
        const errorMsg = e instanceof Error ? e.message : 'Agent error';
        setHistory((prev) => [...prev, { role: 'agent', content: `Error: ${errorMsg}` }]);
      } finally {
        setLoading(false);
      }
    },
    [message, loading]
  );

  if (!embedded && collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="flex flex-col items-center justify-center w-14 shrink-0 border-l border-zinc-800/60 bg-zinc-900/50 hover:bg-zinc-800/50 transition-all duration-200 py-4 gap-1"
        title="Open AI Assistant"
      >
        <span className="text-2xl">🤖</span>
        <span className="text-[10px] font-medium text-zinc-400">AI</span>
      </button>
    );
  }

  return (
    <div className={`flex flex-col bg-[#0c0c0c]/98 backdrop-blur-md h-full ${embedded ? 'w-full' : 'w-full max-w-[360px] min-w-[300px] shrink-0 border-l border-zinc-800/60'}`}>
      {!embedded && (
        <div className="border-b border-zinc-800/60 px-4 py-2.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-base shadow-sm">
              🤖
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-100">Archimedes AI</h3>
              <p className="text-xs text-zinc-400">Always here to help</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="w-8 h-8 rounded-lg hover:bg-zinc-800/50 flex items-center justify-center text-zinc-400 hover:text-zinc-100 transition-colors"
            title="Minimize"
          >
            ←
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {history.length === 0 ? (
          <div className="text-center text-zinc-500 text-sm pt-6">
            <p className="font-medium text-zinc-300 mb-1">Ask me anything</p>
            <p className="text-xs text-zinc-500 mb-4">
              Pools, swaps, multi-token baskets, or strategies on Base.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {['Get test tokens', 'Swap 100 USDT to WETH', 'Swap 100 USDT and 0.02 WBTC to WETH', 'Best pools by APR'].map(
                (suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setMessage(suggestion)}
                    className="rounded-lg border border-zinc-700/50 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400 hover:border-blue-500/30 hover:text-blue-300 transition-colors"
                  >
                    {suggestion}
                  </button>
                )
              )}
            </div>
          </div>
        ) : (
          history.map((item, idx) => (
            <div
              key={idx}
              className={`flex animate-fade-in ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  item.role === 'user'
                    ? 'bg-blue-600/20 text-blue-200 border border-blue-500/20'
                    : 'bg-zinc-800/50 text-zinc-300 border border-zinc-700/50'
                }`}
              >
                {item.content}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-zinc-800/50 rounded-xl px-3 py-2 text-sm text-zinc-400 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              Thinking...
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800/60 p-3.5 shrink-0">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask about pools, swap, invest..."
            className="flex-1 border-zinc-800/50 bg-zinc-900/50 text-zinc-100 text-sm"
            disabled={loading}
          />
          <Button
            type="submit"
            disabled={loading || !message.trim()}
            className="bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-500 hover:to-purple-500 px-4"
          >
            Send
          </Button>
        </form>
      </div>
    </div>
  );
}
