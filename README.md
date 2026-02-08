# Archimedes Protocol

**Multi-token basket swaps on Uniswap v4 with AI-powered intent resolution.**

Archimedes lets users swap multiple tokens into a single output token in **one on-chain transaction**, saving gas and reducing wallet confirmations. An AI chat assistant (Claude) parses natural language into executable swap intents, pool lookups, and test-token minting -- all on **Base Sepolia**.

Built for [ETHGlobal HackMoney](https://ethglobal.com/).

---

## The Problem

Swapping a diversified portfolio into a single asset on existing DEXs requires **N separate transactions** -- one per input token. For a user converting USDT + WBTC + USDC into WETH, that means:

| Traditional DEX | Archimedes |
|----------------|------------|
| 3 approval txs | 3 approval txs (one-time, max) |
| 3 swap txs | **1 swap tx** |
| 6 total wallet prompts | **4 total** (then just 1 per future basket) |
| ~450k gas total | **~280k gas total** |
| 3 block confirmations | **1 block confirmation** |

After the first basket (approvals cached), every subsequent basket swap of the same tokens is **one click, one transaction**.

## How It Works

### Architecture

```
User (wallet)
  |
  |-- AI Chat (Claude) -----> /api/agent -----> structured intent
  |                                               |
  |-- Swap UI <-----------------------------------+
  |     |
  |     |-- Single swap -----> Hookmate V4 Router -----> PoolManager + YieldOptimizerHook
  |     |
  |     |-- Basket swap -----> BasketSwapper contract
  |                               |
  |                               +-- for each input token:
  |                                     transferFrom(user) -> approve(router) -> router.swap()
  |                               |
  |                               +-- all in ONE transaction
  |
  +-- Get Test Tokens (mint mock ERC-20s)
```

### Key Components

| Component | What it does |
|-----------|-------------|
| **BasketSwapper.sol** | On-chain contract that wraps N single-pool swaps into one atomic transaction. Pulls input tokens, approves the router, calls `swapExactTokensForTokens` for each leg. |
| **YieldOptimizerHook.sol** | Uniswap v4 hook attached to every pool. Fires `beforeSwap` / `afterSwap` on every swap (including each leg of a basket swap). Enables JIT liquidity provisioning and volume tracking. |
| **Hookmate V4 Swap Router** | The standard Uniswap v4 router that executes individual swaps via `PoolManager.swap()`. |
| **AI Agent** (`/api/agent`) | Claude-powered NLP that parses user messages into `SWAP`, `BASKET_SWAP`, `FIND_POOLS`, or `MINT_TEST_TOKENS` intents with structured params. |
| **Swap UI** | React frontend with multi-token input, real-time USD valuation, Max buttons, token balances, and one-click basket execution. |

### Single Swap Flow

```
1. User approves Router for token  (one-time max approval)
2. User calls Router.swapExactTokensForTokens(...)
3. Router -> PoolManager.swap() -> YieldOptimizerHook.beforeSwap() -> swap -> afterSwap()
4. Output token sent to user
```

### Basket Swap Flow (the innovation)

```
1. User approves BasketSwapper for each input token  (one-time max approval)
2. User calls BasketSwapper.basketSwap(inputs[], receiver, deadline)
3. For each input token:
   a. BasketSwapper.transferFrom(user, self, amountIn)
   b. BasketSwapper.approve(router, amountIn)
   c. Router.swapExactTokensForTokens(...)  -> PoolManager -> Hook fires
4. All output tokens land in user's wallet
5. ONE transaction hash, ONE block confirmation
```

---

## Gas Savings Analysis

Estimated gas costs on Base Sepolia (actual values from on-chain execution):

| Scenario | Traditional (N txs) | Archimedes (1 tx) | Savings |
|----------|--------------------|--------------------|---------|
| 2 tokens -> 1 | ~180k (2 x 90k) | ~150k | **~17%** |
| 3 tokens -> 1 | ~270k (3 x 90k) | ~210k | **~22%** |
| 5 tokens -> 1 | ~450k (5 x 90k) | ~320k | **~29%** |

Savings come from:
- **Shared transaction overhead**: base 21k gas paid once instead of N times
- **Warm storage slots**: PoolManager storage is warm after the first sub-swap, reducing SLOAD costs by ~1,900 gas each
- **Single callback context**: the unlock/callback pattern on PoolManager is entered once per sub-swap but the contract context is already warm

After initial approvals (max, cached forever), the user experience is:

| Action | Wallet prompts |
|--------|---------------|
| Single swap | 1 (swap) |
| 2-token basket | 1 (basketSwap) |
| 5-token basket | 1 (basketSwap) |

---

## Optimal Path Selection

Every swap (single or basket) runs through an **optimal path selector** that:

1. Checks if a direct pool exists (e.g., USDT-WETH)
2. Evaluates intermediate routes (e.g., USDC -> USDT -> WETH)
3. Compares estimated output across all candidates
4. Picks the path with the **highest output** (best price after fees)

For single swaps, multi-hop paths are supported automatically. For basket swaps, each input token uses the direct pool to the output token.

---

## Repository Structure

```
HackMoney/
  README.md                 # This file
  my-app/                   # Next.js frontend + API routes
    app/
      api/agent/route.ts    # AI agent (Claude) - intent parsing
      components/
        SwapInterface.tsx    # Swap UI (single + basket)
        ChatPanel.tsx        # AI chat sidebar
        GetTokens.tsx        # Test token minting modal
      page.tsx               # Main layout (Home, Pools, Swap)
    lib/
      abis/                  # Contract ABIs
        basket-swapper.ts    # BasketSwapper ABI
        v4-router.ts         # Hookmate V4 Router ABI
        erc20.ts             # Standard ERC-20 ABI
      constants/
        swap.ts              # Router, BasketSwapper, hook addresses, pool pairs
        tokens.ts            # Token addresses, decimals, logos, prices
      hooks/
        useSwap.ts           # wagmi hook: executeSingleSwap + executeBasketSwaps
      services/
        quote.ts             # Price estimation (constant prices for testnet)
        swap-path.ts         # Optimal path selection
        pools.ts             # Pool discovery
  v4-template/               # Foundry (Solidity) contracts
    src/
      YieldOptimizerHook.sol # Uniswap v4 hook (beforeSwap, afterSwap, JIT, idle liquidity)
      BasketSwapper.sol      # Multi-token basket swap wrapper
    script/
      00_DeployYieldOptimizerHook.s.sol  # Deploy hook
      04_DeployMockTokensAndPools.s.sol  # Deploy tokens + pools
      05_DeployBasketSwapper.s.sol       # Deploy BasketSwapper
```

---

## Deployed Contracts (Base Sepolia)

| Contract | Address |
|----------|---------|
| Hookmate V4 Swap Router | `0x71cD4Ea054F9Cb3D3BF6251A00673303411A7DD9` |
| YieldOptimizerHook | `0x05a6b10faaE4C0B687a160Ffb1848EF4aE148cC0` |
| BasketSwapper | `0x91C39d20aA835db4b5A6Bc45203046F342E85926` |
| Mock USDT (6 dec) | `0x1483d7bfAB636450b88AB4A75fAcF14e589496a8` |
| Mock USDC (6 dec) | `0xBfcf6CF03805BD5Ef13a0F0665262C434832b7FE` |
| Mock WETH (18 dec) | `0x7CC14257d013286c203ae9378f4EEabFf713B717` |
| Mock WBTC (8 dec) | `0x5c54bA14856203213D85428C6F61405BDb39D52c` |
| Mock DAI (18 dec) | `0xB47200B29aD83878264af21e9232C174BAceaD7A` |

### Pools

| Pool | Pair | Price Ratio |
|------|------|------------|
| USDT-WETH | USDT / WETH | 1 WETH = 2,104 USDT |
| USDT-WBTC | USDT / WBTC | 1 WBTC = 70,230 USDT |
| WBTC-WETH | WBTC / WETH | 1 WBTC = 33 WETH |
| USDC-USDT | USDC / USDT | 1:1 |
| DAI-USDT | DAI / USDT | 1:1 |

All pools use **0.30% fee**, **60 tick spacing**, and the **YieldOptimizerHook**.

---

## AI Assistant

The Archimedes AI (powered by Claude) understands natural language and converts it into structured blockchain actions:

| User says | AI does |
|-----------|---------|
| "swap 100 USDT to WETH" | Pre-fills Swap UI with USDT -> WETH, 100 |
| "swap 100 USDT and 0.02 WBTC to WETH" | Pre-fills as basket swap (multi-token toggle on) |
| "get test tokens" | Opens the mint modal |
| "best pools by APR" | Returns top pools sorted by APR |
| "convert 50 USDC, 50 DAI and 0.1 ETH into WBTC" | Pre-fills 3-token basket -> WBTC |

The AI handles:
- Token symbol normalization (ETH -> WETH, BTC -> WBTC)
- Multi-token detection (2+ inputs -> BASKET_SWAP)
- Fallback regex parsing when the LLM response is malformed

---

## Quick Start

### Prerequisites

- Node.js 18+
- Foundry (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- A wallet with Base Sepolia ETH (for gas)

### 1. Frontend

```bash
cd my-app
cp .env.example .env.local
# Set ANTHROPIC_API_KEY in .env.local
yarn install
yarn dev
```

### 2. Deploy Contracts (if redeploying)

```bash
cd v4-template

# Deploy YieldOptimizerHook
forge script script/00_DeployYieldOptimizerHook.s.sol:DeployYieldOptimizerHook \
  --rpc-url https://sepolia.base.org --broadcast

# Deploy mock tokens + pools
forge script script/04_DeployMockTokensAndPools.s.sol:DeployMockTokensAndPools \
  --rpc-url https://sepolia.base.org --broadcast

# Deploy BasketSwapper
forge script script/05_DeployBasketSwapper.s.sol:DeployBasketSwapper \
  --rpc-url https://sepolia.base.org --broadcast
```

Then update addresses in `my-app/lib/constants/tokens.ts` and `my-app/lib/constants/swap.ts`.

### 3. Get Test Tokens

Connect your wallet in the app, click **"Get test tokens"**, and mint USDT, USDC, WETH, WBTC, and DAI to your address. The mock tokens have public `mint` functions -- anyone can mint.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React, Tailwind CSS |
| Wallet | RainbowKit, wagmi, viem |
| AI | Anthropic Claude (Haiku 4.5), Vercel AI SDK |
| Smart Contracts | Solidity 0.8.26, Foundry |
| Protocol | Uniswap v4, Hookmate |
| Network | Base Sepolia (testnet) |

---

## License

MIT
# Archimedes
