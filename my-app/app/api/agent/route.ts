import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { findPools } from '@/lib/services/pools';
import type { PoolRef } from '@/lib/types/pools';

const AgentRequestSchema = z.object({
  message: z.string().min(1),
  context: z
    .object({
      chainId: z.number().optional(),
    })
    .optional(),
});

// Params: accept loose types from model, we coerce in tryParse
const ActionParamsSchema = z.object({
  chainId: z.number().optional(),
  mustIncludeSymbol: z.string().optional(),
  limit: z.number().optional(),
  sortBy: z.enum(['apr', 'tvl', 'volume24h']).optional(),
  poolId: z.string().optional(),
  allocationBps: z.number().optional(),
  // Single swap
  tokenInSymbol: z.string().optional(),
  tokenOutSymbol: z.string().optional(),
  amountIn: z.string().optional(),
  amountInWei: z.string().optional(),
  chainIdForSwap: z.number().optional(),
  slippagePercent: z.number().optional(),
  // Basket swap (multiple input tokens)
  inputTokens: z.array(z.object({
    symbol: z.string(),
    amount: z.string(),
  })).optional(),
});

const ACTION_TYPES = ['FIND_POOLS', 'INVEST', 'SWAP', 'BASKET_SWAP', 'MINT_TEST_TOKENS', 'NONE'] as const;
const AgentActionSchema = z.object({
  type: z.enum(ACTION_TYPES),
  params: ActionParamsSchema.optional(),
});

const AgentResponseSchema = z.object({
  summary: z.string(),
  actions: z.array(AgentActionSchema),
});

type AgentAction = z.infer<typeof AgentActionSchema>;

const SYSTEM_PROMPT = `You are Archimedes Agent, an AI-powered DeFi assistant for the Archimedes Protocol.
Archimedes is a Uniswap v4 protocol on Base Sepolia that features:
- Single token swaps (e.g. USDT → WETH)
- Multi-token basket swaps (e.g. USDT + WBTC → WETH in ONE transaction via the BasketSwapper contract)
- YieldOptimizerHook that fires beforeSwap/afterSwap on every swap for JIT liquidity and volume tracking
- Pool discovery and investment

Available tokens on Base Sepolia: USDT, USDC, WETH, WBTC, DAI.
Available pools: USDT-WETH, USDT-WBTC, USDC-USDT, DAI-USDT, WBTC-WETH.

## YOUR JOB
1. Read the user message.
2. Extract intent: find pools, single swap, basket swap (multi-token), mint test tokens, or general question.
3. Return a JSON object with the exact schema described below.

## ACTION TYPES

### SWAP (single token → single token)
When the user wants to swap ONE input token for ONE output token.
- tokenInSymbol: Input token symbol (USDT, USDC, WETH, WBTC, DAI)
- tokenOutSymbol: Output token symbol
- amountIn: Human-readable amount (e.g. "100", "0.5")
- chainIdForSwap: Chain for the swap (default 84532 = Base Sepolia)
- slippagePercent: Optional (e.g. 0.5)

Examples:
- "swap 100 USDT to WETH" → SWAP with tokenInSymbol: "USDT", tokenOutSymbol: "WETH", amountIn: "100"
- "convert 0.5 ETH to USDC" → SWAP with tokenInSymbol: "WETH", tokenOutSymbol: "USDC", amountIn: "0.5"

### BASKET_SWAP (multiple tokens → single token)
When the user wants to swap MULTIPLE input tokens into ONE output token in a single transaction.
This is the key feature of Archimedes — it saves gas by batching swaps via the BasketSwapper contract.
- inputTokens: Array of { symbol, amount } for each input token
- tokenOutSymbol: The single output token symbol
- chainIdForSwap: Chain (default 84532)

Examples:
- "swap 100 USDT and 0.02 WBTC to WETH" → BASKET_SWAP with inputTokens: [{"symbol":"USDT","amount":"100"},{"symbol":"WBTC","amount":"0.02"}], tokenOutSymbol: "WETH"
- "convert 50 USDC, 50 DAI and 0.1 ETH into WBTC" → BASKET_SWAP with inputTokens: [{"symbol":"USDC","amount":"50"},{"symbol":"DAI","amount":"50"},{"symbol":"WETH","amount":"0.1"}], tokenOutSymbol: "WBTC"
- "basket swap all my tokens to WETH" → BASKET_SWAP (ask amounts if not given)

Key rule: If the user mentions 2+ input tokens with amounts AND one output token, always use BASKET_SWAP, not SWAP.

### FIND_POOLS
When the user wants to discover, list, or search liquidity pools.
- chainId: 84532 (Base Sepolia, default)
- mustIncludeSymbol: Token that must be in the pool (e.g. USDC, WETH). Normalize: "eth"→WETH, "btc"→WBTC
- limit: Max pools to return (default 5, max 20)
- sortBy: "apr" | "tvl" | "volume24h"

### INVEST
When the user wants to invest in a specific pool.
- poolId: The pool id string
- allocationBps: 0-5000 (5000 = 50%)

### MINT_TEST_TOKENS
When the user wants test tokens, faucet, or to mint tokens for testing on Base Sepolia.
No params needed. Triggers: "get test tokens", "mint me tokens", "faucet", "I need testnet tokens".

### NONE
Use when the message is a greeting, question about capabilities, or not a clear action. Respond helpfully about what Archimedes can do.

## OUTPUT FORMAT
Return ONLY a single JSON object, no markdown or code blocks:
{ "summary": "string", "actions": [ { "type": "...", "params": { ... } } ] }

## RULES
- Output ONLY valid JSON. No markdown, no code fences, no text before or after.
- Normalize token symbols: "eth"/"ether"→"WETH", "btc"/"bitcoin"→"WBTC", always uppercase.
- For amounts use string (e.g. "100", "0.5"), never scientific notation.
- Default chain is Base Sepolia (84532).
- If user says "swap X and Y to Z" with multiple inputs, use BASKET_SWAP.
- If user says "swap X to Y" with one input, use SWAP.
- Be concise in summaries. Mention gas savings when using basket swaps.`;

export async function POST(req: NextRequest) {
  try {
    const body = AgentRequestSchema.parse(await req.json());
    const chainId = body.context?.chainId ?? 84532;

    const userPrompt = `User message: "${body.message}"

Context: chainId ${chainId} (Base Sepolia). Available tokens: USDT (6 dec), USDC (6 dec), WETH (18 dec), WBTC (8 dec), DAI (18 dec). Available pools: USDT-WETH, USDT-WBTC, USDC-USDT, DAI-USDT, WBTC-WETH.

Parse the intent and return ONLY a JSON object.
- Multiple input tokens + one output → BASKET_SWAP
- One input + one output → SWAP
- Pool questions → FIND_POOLS
- Test token requests → MINT_TEST_TOKENS
- Everything else → NONE`;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY is not set' },
        { status: 500 }
      );
    }

    const anthropic = createAnthropic({ apiKey });
    const model = anthropic('claude-haiku-4-5-20251001');

    const result = await generateText({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK 3.x vs Anthropic provider type mismatch
      model: model as any,
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      temperature: 0.15,
    });
    const text = result.text ?? (result as { output?: string }).output ?? '';

    let cleanedText = (text ?? '').trim();
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    } else if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```\s*/, '').replace(/```\s*$/, '');
    }

    let parsedData: z.infer<typeof AgentResponseSchema> | null = null;
    const normalizeActionType = (t: unknown): (typeof ACTION_TYPES)[number] => {
      const s = String(t ?? '').toUpperCase().replace(/\s+/g, '_');
      if (ACTION_TYPES.includes(s as (typeof ACTION_TYPES)[number])) return s as (typeof ACTION_TYPES)[number];
      if (s === 'BASKET_SWAP' || s === 'MULTI_SWAP' || s === 'MULTI_TOKEN_SWAP') return 'BASKET_SWAP';
      if (s === 'SWAP' || s.includes('SWAP')) return 'SWAP';
      if (s === 'MINT_TEST_TOKENS' || s.includes('MINT') || s.includes('FAUCET') || s.includes('TEST_TOKENS')) return 'MINT_TEST_TOKENS';
      if (s.includes('FIND') || s.includes('POOL')) return 'FIND_POOLS';
      if (s.includes('INVEST')) return 'INVEST';
      return 'NONE';
    };
    const normalizeSortBy = (v: unknown): 'apr' | 'tvl' | 'volume24h' | undefined => {
      const s = String(v ?? '').toLowerCase();
      if (s === 'apr') return 'apr';
      if (s === 'tvl') return 'tvl';
      if (s === 'volume24h' || s === 'volume') return 'volume24h';
      return undefined;
    };
    const normalizeSymbol = (s: string): string => {
      const upper = s.toUpperCase().trim();
      if (upper === 'ETH' || upper === 'ETHER') return 'WETH';
      if (upper === 'BTC' || upper === 'BITCOIN') return 'WBTC';
      return upper;
    };
    const coerceParams = (p: unknown): z.infer<typeof ActionParamsSchema> | undefined => {
      if (!p || typeof p !== 'object') return undefined;
      const o = p as Record<string, unknown>;
      // Parse inputTokens array for basket swaps
      let inputTokens: Array<{ symbol: string; amount: string }> | undefined;
      if (Array.isArray(o.inputTokens)) {
        inputTokens = (o.inputTokens as Array<Record<string, unknown>>)
          .filter((t) => t && typeof t === 'object' && t.symbol && t.amount)
          .map((t) => ({
            symbol: normalizeSymbol(String(t.symbol)),
            amount: String(t.amount),
          }));
        if (inputTokens.length === 0) inputTokens = undefined;
      }
      return {
        chainId: o.chainId != null ? Number(o.chainId) : undefined,
        mustIncludeSymbol: typeof o.mustIncludeSymbol === 'string' ? o.mustIncludeSymbol : undefined,
        limit: o.limit != null ? Number(o.limit) : undefined,
        sortBy: normalizeSortBy(o.sortBy),
        poolId: typeof o.poolId === 'string' ? o.poolId : undefined,
        allocationBps: o.allocationBps != null ? Number(o.allocationBps) : undefined,
        tokenInSymbol: typeof o.tokenInSymbol === 'string' ? normalizeSymbol(o.tokenInSymbol) : undefined,
        tokenOutSymbol: typeof o.tokenOutSymbol === 'string' ? normalizeSymbol(o.tokenOutSymbol) : undefined,
        amountIn: typeof o.amountIn === 'string' ? o.amountIn : (typeof o.amountIn === 'number' ? String(o.amountIn) : undefined),
        amountInWei: typeof o.amountInWei === 'string' ? o.amountInWei : undefined,
        chainIdForSwap: o.chainIdForSwap != null ? Number(o.chainIdForSwap) : undefined,
        slippagePercent: o.slippagePercent != null ? Number(o.slippagePercent) : undefined,
        inputTokens,
      };
    };
    const tryParse = (str: string) => {
      try {
        const raw = JSON.parse(str) as unknown;
        if (!raw || typeof raw !== 'object') return;
        const obj = raw as { summary?: string; actions?: Array<{ type?: unknown; params?: unknown }> };
        const actionsArray = obj.actions;
        if (!Array.isArray(actionsArray)) return;
        const normalized = {
          summary: typeof obj.summary === 'string' ? obj.summary : 'Done.',
          actions: actionsArray.map((a) => ({
            type: normalizeActionType(a?.type),
            params: coerceParams(a?.params),
          })),
        };
        const result = AgentResponseSchema.safeParse(normalized);
        if (result.success) {
          parsedData = result.data;
        } else if (process.env.NODE_ENV === 'development') {
          console.log('[Agent] Zod validation failed:', result.error.flatten());
        }
      } catch (parseErr) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[Agent] JSON parse error:', parseErr);
        }
      }
    };
    if (cleanedText) {
      tryParse(cleanedText);
      if (!parsedData) {
        const first = cleanedText.indexOf('{');
        const last = cleanedText.lastIndexOf('}');
        if (first !== -1 && last > first) tryParse(cleanedText.slice(first, last + 1));
      }
    }
    if (process.env.NODE_ENV === 'development' && !parsedData) {
      console.log('[Agent] Parse failed. Text length:', cleanedText.length, cleanedText.length > 0 ? `Preview: ${cleanedText.slice(0, 400)}` : '(empty)');
    }

    // Fallback: detect intent from user message when model response is missing or invalid
    const fallbackFromMessage = (msg: string): z.infer<typeof AgentResponseSchema> | null => {
      const m = msg.toLowerCase().trim();
      const tokenSymbols = ['usdc', 'usdt', 'dai', 'weth', 'eth', 'wbtc', 'btc'];
      const matchToken = tokenSymbols.find((t) => m.includes(t));
      const symbol = matchToken ? normalizeSymbol(matchToken) : undefined;

      if (/\b(best|top|find|show|list|get|search).*pool|pool.*(best|apr|tvl|volume)/.test(m) || /\bpool[s]?\s*(on|for|with|by)/.test(m)) {
        const sortBy = m.includes('tvl') ? 'tvl' as const : m.includes('volume') ? 'volume24h' as const : 'apr' as const;
        return {
          summary: `Here are the best ${symbol ? `${symbol} ` : ''}pools${sortBy !== 'apr' ? ` by ${sortBy}` : ' by APR'}.`,
          actions: [{ type: 'FIND_POOLS', params: { chainId: 84532, mustIncludeSymbol: symbol, limit: 10, sortBy } }],
        };
      }
      if (/\b(get|mint|give me|need|want)\s+(test\s+)?tokens?\b/i.test(m) || /\bfaucet\b/i.test(m) || /\btestnet\s+tokens?\b/i.test(m)) {
        return {
          summary: 'Opening Get test tokens — mint USDT, USDC, WETH, WBTC, and DAI on Base Sepolia.',
          actions: [{ type: 'MINT_TEST_TOKENS' }],
        };
      }

      // Multi-token basket swap: "swap 100 USDT and 0.02 WBTC to WETH"
      const basketMatch = m.match(/(?:swap|convert|exchange)\s+(.+?)(?:\s+to\s+|\s+into\s+|\s+for\s+)(\w+)\s*$/i);
      if (basketMatch) {
        const inputPart = basketMatch[1];
        const outSym = normalizeSymbol(basketMatch[2]);
        // Parse "100 USDT and 0.02 WBTC" or "100 USDT, 0.02 WBTC"
        const tokenPairs = [...inputPart.matchAll(/(\d+(?:\.\d+)?)\s*(\w+)/g)];
        if (tokenPairs.length > 1) {
          const inputTokens = tokenPairs.map(([, amount, sym]) => ({
            symbol: normalizeSymbol(sym),
            amount: amount!,
          }));
          const inputStr = inputTokens.map((t) => `${t.amount} ${t.symbol}`).join(' + ');
          return {
            summary: `Basket swap: ${inputStr} → ${outSym} in a single transaction.`,
            actions: [{ type: 'BASKET_SWAP', params: { inputTokens, tokenOutSymbol: outSym, chainIdForSwap: 84532 } }],
          };
        }
        // Single swap
        if (tokenPairs.length === 1) {
          const [, amount, sym] = tokenPairs[0];
          return {
            summary: `Ready to swap ${amount} ${normalizeSymbol(sym!)} → ${outSym}.`,
            actions: [{ type: 'SWAP', params: { tokenInSymbol: normalizeSymbol(sym!), tokenOutSymbol: outSym, amountIn: amount, chainIdForSwap: 84532 } }],
          };
        }
      }

      // Simple single swap: "swap 100 USDC to WETH"
      const swapMatch = m.match(/(?:swap|convert|exchange)\s+(\d+(?:\.\d+)?)\s*(\w+)\s+to\s+(\w+)/i) || m.match(/(\d+(?:\.\d+)?)\s*(\w+)\s+to\s+(\w+)/);
      if (swapMatch) {
        const [, amount, from, to] = swapMatch;
        const fromSym = normalizeSymbol(from!);
        const toSym = normalizeSymbol(to!);
        return {
          summary: `Ready to swap ${amount} ${fromSym} → ${toSym}.`,
          actions: [{ type: 'SWAP', params: { tokenInSymbol: fromSym, tokenOutSymbol: toSym, amountIn: amount, chainIdForSwap: 84532 } }],
        };
      }
      return null;
    };

    const response: z.infer<typeof AgentResponseSchema> =
      parsedData ??
      fallbackFromMessage(body.message) ?? {
        summary: 'I can help you swap tokens, do multi-token basket swaps, find pools, or mint test tokens. Try:\n• "swap 100 USDT to WETH"\n• "swap 100 USDT and 0.02 WBTC to WETH"\n• "get test tokens"\n• "best USDC pools"',
        actions: [{ type: 'NONE' as const }],
      };
    const actions = response.actions;

    // Execute FIND_POOLS server-side and build structured data for the client
    const executed: Array<Record<string, unknown>> = [];
    let poolsResult: PoolRef[] = [];

    for (const action of actions) {
      if (action.type === 'FIND_POOLS' && action.params) {
        const pools = findPools({
          chainId: action.params.chainId ?? chainId ?? 84532,
          mustIncludeSymbol: action.params.mustIncludeSymbol,
          limit: action.params.limit ?? 10,
          sortBy: action.params.sortBy ?? 'apr',
        });
        poolsResult = pools;
        executed.push({ action, result: { pools } });
      } else if (action.type === 'SWAP' && action.params) {
        executed.push({
          action,
          transactionReady: {
            tokenIn: action.params.tokenInSymbol,
            tokenOut: action.params.tokenOutSymbol,
            amountIn: action.params.amountIn,
            chainId: action.params.chainIdForSwap ?? chainId,
            slippagePercent: action.params.slippagePercent,
          },
        });
      } else if (action.type === 'BASKET_SWAP' && action.params) {
        executed.push({
          action,
          transactionReady: {
            inputTokens: action.params.inputTokens,
            tokenOut: action.params.tokenOutSymbol,
            chainId: action.params.chainIdForSwap ?? chainId,
          },
        });
      } else {
        executed.push({ action });
      }
    }

    // Structured data: same shape every time so the client can easily extract by type
    type IntentData =
      | { type: 'swap'; inputTokens: Array<{ symbol: string; value: string }>; outputToken: { symbol: string } }
      | { type: 'pool'; tokens: string[]; pools?: PoolRef[] }
      | { type: 'mint_tokens' }
      | { type: 'none' };

    const firstAction = actions[0];
    let data: IntentData = { type: 'none' };

    if (firstAction?.type === 'MINT_TEST_TOKENS') {
      data = { type: 'mint_tokens' };
    } else if (firstAction?.type === 'BASKET_SWAP' && firstAction.params?.inputTokens?.length && firstAction.params?.tokenOutSymbol) {
      // Basket swap → send all input tokens to the swap UI
      data = {
        type: 'swap',
        inputTokens: firstAction.params.inputTokens.map((t) => ({ symbol: t.symbol, value: t.amount })),
        outputToken: { symbol: firstAction.params.tokenOutSymbol },
      };
    } else if (firstAction?.type === 'SWAP' && firstAction.params?.tokenInSymbol && firstAction.params?.tokenOutSymbol) {
      data = {
        type: 'swap',
        inputTokens: [{ symbol: firstAction.params.tokenInSymbol, value: firstAction.params.amountIn ?? '0' }],
        outputToken: { symbol: firstAction.params.tokenOutSymbol },
      };
    } else if (firstAction?.type === 'FIND_POOLS' && firstAction.params) {
      data = {
        type: 'pool',
        tokens: firstAction.params.mustIncludeSymbol ? [firstAction.params.mustIncludeSymbol] : [],
        pools: poolsResult.length > 0 ? poolsResult : undefined,
      };
    }

    return NextResponse.json({ summary: response.summary, data, executed });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Agent error';
    console.error('Agent API error:', e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
