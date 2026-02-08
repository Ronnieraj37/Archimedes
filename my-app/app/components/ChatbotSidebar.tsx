'use client';

import React, { useState, useCallback } from 'react';
import { Button, Input } from './ui';

interface ChatbotSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChatbotSidebar({ isOpen, onClose }: ChatbotSidebarProps) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Array<{ role: 'user' | 'agent'; content: string }>>([]);

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

        const agentResponse = json.summary || 'No response';
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

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden animate-fade-in"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed right-0 top-0 h-full w-full lg:w-96 bg-zinc-950 border-l border-zinc-800/50 z-50 flex flex-col transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="border-b border-zinc-800/50 p-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">Archimedes AI</h3>
            <p className="text-xs text-zinc-400">Ask me anything about pools</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-zinc-800/50 flex items-center justify-center text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {history.length === 0 ? (
            <div className="text-center text-zinc-500 text-sm mt-8">
              <div className="text-4xl mb-3">🤖</div>
              <p>Ask me about pools, investments, or DeFi strategies!</p>
              <p className="text-xs mt-2 text-zinc-600">
                Try: "Show me the best USDC pools on Base"
              </p>
            </div>
          ) : (
            history.map((item, idx) => (
              <div
                key={idx}
                className={`flex animate-slide-in ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}
                style={{ animationDelay: `${idx * 0.1}s` }}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
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
              <div className="bg-zinc-800/50 rounded-lg px-3 py-2 text-sm text-zinc-300">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 spinner" />
                  Thinking...
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-zinc-800/50 p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask about pools..."
              className="flex-1 border-zinc-800/50 bg-zinc-900/50 text-zinc-100"
              disabled={loading}
            />
            <Button
              type="submit"
              disabled={loading || !message.trim()}
              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-500 hover:to-purple-500"
            >
              Send
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
