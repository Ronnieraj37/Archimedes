# Archimedes Protocol

**A better DeFi app — we get there by solving real problems.**

Archimedes is a DeFi experience that puts users first: fewer clicks, less gas, and capital that works for you. We don’t just add features — we fix the friction that makes DeFi painful. Below is how we do it.

---

## How we make DeFi better (problems we solve)

| Problem | How we solve it |
|--------|------------------|
| **Multi-token swaps = N transactions** | One basket swap: many tokens → one asset in a single on-chain tx. Fewer prompts, one confirmation, one click after approvals. |
| **DeFi UX feels like work** | AI agent (Claude) turns natural language into actions: “swap 100 USDT and 0.02 WBTC to WETH” → pre-filled swap or execution. No forms-first. |
| **Idle liquidity doesn’t earn** | When you invest in pools, our backend uses **LI.FI** to deploy and rebalance that liquidity across chains, and **Yellow** for off-chain sessions (instant quotes, micro-moves, settle on-chain when you’re done). |
| **Cross-chain is fragmented** | LI.FI-powered cross-chain quotes and routes in the app; backend uses the same to move liquidity where it earns. |
| **Addresses and chains are opaque** | ENS in the UI (wallet name, “Send to” by name); clear flows for swap, invest, and cross-chain. |

We build on **Uniswap v4**, **Base**, and a stack that prioritizes reliability and composability — so “better DeFi” is measurable (fewer prompts, one confirmation per basket, liquidity deployed) not just marketing.

---

## Technologies & Integrations

| Technology | How we use it |
|------------|----------------|
| **Uniswap v4** | All swaps go through the v4 PoolManager; pools use our custom hook. |
| **Hookmate** | V4 Swap Router for single and basket swap execution. |
| **Base** | Deployed and tested on Base Sepolia (and Base mainnet for cross-chain). |
| **ENS** | Connected wallet’s ENS name in the header; Swap “Send to” accepts an address or ENS name (resolved via wagmi `useEnsName` / `useEnsAddress`). |
| **LI.FI** | Cross-chain quotes in the app (Cross-chain tab). Backend uses LI.FI to deploy and rebalance **idle liquidity** across chains—e.g. move user-allocated capital to higher-yield pools on other EVM chains. |
| **Yellow** | Session-based, **off-chain** operations on allocated liquidity—instant quotes and micro-moves without gas per action; settle on-chain when the user ends the session. Used for “invest idle” and frequent rebalance flows. |
| **AI** | Agent parses natural language into swap intents, basket params, pool lookups, and test-token minting. |

---

## Problem in focus: multi-token swaps

Swapping a diversified portfolio into a single asset on typical DEXs means **N separate transactions** — one per input token. For a user converting USDT + WBTC + USDC into WETH, that looks like:

| Traditional DEX | Archimedes |
|----------------|------------|
| 3 approval txs | 3 approval txs (one-time, max) |
| 3 swap txs | **1 swap tx** |
| 6 total wallet prompts | **4 total** (then just 1 per future basket) |
| 3 block confirmations | **1 block confirmation** |

After the first basket (approvals cached), every subsequent basket swap of the same tokens is **one click, one transaction**. That’s one of the concrete ways we make DeFi better.

## How it works (under the hood)

### Architecture

```
User (wallet)
  |
  |-- AI Chat -----> /api/agent -----> structured intent
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
  |-- Invest in pools -----> user allocates liquidity
  |                               |
  |                               v
  |                    +----------+----------+
  |                    |                     |
  |                    v                     v
  |              Idle Liquidity        Yellow (off-chain)
  |              Manager               session: instant quotes,
  |                    |               micro-moves, no gas per action
  |                    v                     |
  |              LI.FI SDK                    |
  |              cross-chain                  |
  |              routes: deploy /             |
  |              rebalance liquidity          |
  |              on other EVM chains         |
  |                    |                     |
  |                    +----------+----------+
  |                               |
  |                               v
  |                    Settle on-chain (when session ends or rebalance executes)
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
| **Swap UI** | React frontend with multi-token input, real-time USD valuation, Max buttons, token balances, optional “Send to” (address or ENS), and one-click basket execution. |
| **LI.FI** | Cross-chain tab for quotes; backend idle-liquidity-manager uses LI.FI SDK to get routes and deploy/rebalance user-allocated liquidity across EVM chains. |
| **Yellow** | Session API and SDK integration: off-chain state for allocated liquidity (instant quotes, micro-moves); on-chain settlement when the user ends the session. |

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

### Idle liquidity workflow (LI.FI + Yellow)

When users invest in pools, allocated liquidity is managed by the backend using LI.FI and Yellow:

```
User invests in pool
        |
        v
  Allocated liquidity (idle capital)
        |
        +------------------+------------------+
        |                  |                  |
        v                  v                  v
   LI.FI SDK          Yellow SDK         On-chain
   get routes         create session     (Uniswap v4
   across chains      off-chain:         pools)
        |             instant quotes,
        v             micro-moves             |
   Deploy /               |                  |
   rebalance              v                  |
   on other EVM      End session              |
   chains                  |                  |
        |                  v                  |
        |             Settle on-chain <--------+
        |                  |
        +------------------+
```

- **LI.FI:** Backend uses LI.FI to find cross-chain routes and move idle liquidity to higher-yield pools on other EVM chains.
- **Yellow:** User opens a session; quotes and small rebalances happen off-chain (no gas per action); when the session ends, final state settles on-chain.

---

## Gas and UX: What We Measured

We added a **gas benchmark test** (`v4-template/test/GasComparison.t.sol`) that compares N separate swap txs (traditional) vs 1 basket swap tx, **including the 21k base cost per transaction**. The contract is optimized: approve the router once per unique token (max), and use a direct interface call to the router instead of a low-level `call` + `abi.encode`.

**Results (Foundry, N tokens → 1 output):**

| N   | Traditional (N txs, with base) | Basket (1 tx) | Basket saves   |
|-----|---------------------------------|---------------|----------------|
| 2   | **~368k**  | **~443k**     | basket higher  |
| 3   | **~541k**  | **~369k**     | **~32%**       |
| 4   | **~720k**  | **~483k**     | **~33%**       |

So for **3+ tokens**, the basket is **cheaper in total gas** because we pay the 21k base cost only once instead of N times; the extra execution from the BasketSwapper (transferFrom, approve, loop) is more than offset. For 2 tokens, execution overhead still makes the basket slightly more expensive than two txs.

**Contract optimizations:**

- **Approve once per unique token:** `if (token.allowance(address(this), router) < amountIn) token.approve(router, type(uint256).max)` so we don’t repeat approve on every leg.
- **Direct router call:** Use `IUniswapV4Router04(router).swapExactTokensForTokens(...)` instead of `router.call(abi.encodeWithSignature(...))` for less overhead.

**Why basket swap wins for UX at any N:**

- One signature, one block confirmation, one wallet prompt after approvals.
- After one-time approvals, every basket is “one click” instead of N clicks.

Run the benchmark: `cd v4-template && forge test --match-contract GasComparisonTest -vvv`.

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
      api/agent/route.ts    # AI agent - intent parsing
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

The Archimedes AI understands natural language and converts it into structured blockchain actions:

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

Archimedes is a better DeFi app because we fix the problems that get in the way — fewer txs, less gas, an AI that understands you, and idle liquidity that works across chains and off-chain until you settle.

---

## License

MIT
