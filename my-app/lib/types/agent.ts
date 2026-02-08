/**
 * Structured intent data returned by /api/agent.
 * Same shape every time so the client can branch on data.type and extract fields.
 */
import type { PoolRef } from './pools';

export type AgentIntentSwap = {
  type: 'swap';
  inputTokens: Array<{ symbol: string; value: string }>;
  outputToken: { symbol: string };
};

export type AgentIntentPool = {
  type: 'pool';
  tokens: string[];
  pools?: PoolRef[];
};

export type AgentIntentNone = {
  type: 'none';
};

export type AgentIntentData = AgentIntentSwap | AgentIntentPool | AgentIntentNone;

export type AgentResponse = {
  summary: string;
  data: AgentIntentData;
  executed: Array<Record<string, unknown>>;
};
