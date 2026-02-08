/**
 * Intent Schema for AI-powered trading commands
 * This is what the LLM outputs when parsing natural language
 */

export type ChainId = number;
export type TokenAddress = string;

export interface SourceAsset {
  chain: ChainId;
  token: TokenAddress;
  amount: string; // BigNumber string
  symbol?: string; // For display
}

export type TargetAction = 'ADD_LIQUIDITY' | 'SWAP' | 'REBALANCE' | 'REMOVE_LIQUIDITY';

export interface Intent {
  sourceAssets: SourceAsset[];
  targetAction: TargetAction;
  targetPool?: {
    poolId: string;
    currency0: TokenAddress;
    currency1: TokenAddress;
    chain: ChainId;
  };
  targetToken?: {
    address: TokenAddress;
    chain: ChainId;
    symbol?: string;
  };
  slippageTolerance?: number; // e.g., 0.5 for 0.5%
  deadline?: number; // Unix timestamp
}

export interface IntentResponse {
  intent: Intent;
  estimatedGas?: string;
  estimatedCost?: string;
  route?: {
    steps: Array<{
      type: 'swap' | 'bridge' | 'liquidity';
      from: SourceAsset;
      to: SourceAsset;
      protocol?: string;
    }>;
    totalTime?: number;
  };
}
