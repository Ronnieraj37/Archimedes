# Archimedes – Deployment Guide (Hackathon Demo)

This guide covers how to deploy the **frontend app** and the **Uniswap v4 hook** so you can showcase the project.

---

## Overview

| What | Where it runs | How you deploy it |
|------|----------------|-------------------|
| **Next.js app** (UI + AI + APIs) | Vercel (or any Node host) | Connect repo → add env vars → deploy |
| **YieldOptimizerHook** (smart contract) | A chain where Uniswap v4 exists (e.g. Base, or Anvil for local demo) | Foundry script → broadcast |

The app talks to the hook only when users do **on-chain** actions (e.g. add liquidity via the hook). Everything else (AI, pools list, swap quotes) works without the hook being deployed.

---

## 1. Deploy the frontend app (Vercel)

### 1.1 Push code to GitHub

```bash
cd /Users/roshanrajsingh/Documents/DApp/HackMoney
git init
git add .
git commit -m "Archimedes hackathon demo"
git remote add origin https://github.com/YOUR_USERNAME/archimedes-agent.git
git push -u origin main
```

### 1.2 Create project on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in (GitHub).
2. **Add New Project** → Import your repo.
3. **Root Directory**: set to `my-app` (so Vercel builds the Next.js app, not the repo root).
4. **Framework Preset**: Next.js (auto-detected).

### 1.3 Environment variables

In Vercel: **Project → Settings → Environment Variables**. Add:

| Name | Value | Required |
|------|--------|----------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key ([console.anthropic.com](https://console.anthropic.com)) | **Yes** (for AI chat) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect project ID ([cloud.walletconnect.com](https://cloud.walletconnect.com)) | **Yes** (for RainbowKit wallet connection) |
| `NEXT_PUBLIC_HOOK_ADDRESS` | Hook contract address (after you deploy the hook) | No (only for on-chain invest/swap via hook) |
| `BASE_RPC` | e.g. `https://mainnet.base.org` or Alchemy/Infura Base URL | Optional (defaults used if not set) |

Save and redeploy so the build uses these variables.

### 1.4 Deploy

- **Deploy** from the Vercel dashboard, or push to `main` to trigger automatic deploy.
- Your demo URL will be like: `https://your-project.vercel.app`.

### 1.5 Optional: run locally for demo

```bash
cd my-app
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY=sk-ant-...
yarn install
yarn dev
```

Open [http://localhost:3000](http://localhost:3000). The AI assistant and all pages work; only hook-dependent features need the contract deployed.

---

## 2. Deploy the hook (YieldOptimizerHook)

The hook must be deployed to a chain that has **Uniswap v4** (PoolManager, PositionManager, etc.). For hackathon you can use:

- **Local Anvil** (easiest for demo: full control, no gas).
- **Base** (or another v4 testnet/mainnet) if v4 is live there and you have RPC + funded wallet.

### 2.1 Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation): `forge`, `cast`, `anvil`.
- In `v4-template`: `forge install` and `forge test` already passing.

### 2.2 Option A: Local Anvil (recommended for stable demo)

1. Start Anvil:

```bash
cd v4-template
anvil
```

2. In another terminal, deploy the v4 infrastructure and then the hook. The template scripts expect a running chain:

```bash
cd v4-template

# Deploy core v4 (PoolManager, etc.) – only needed on local
forge script script/testing/00_DeployV4.s.sol --rpc-url http://localhost:8545 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Mine salt and deploy YieldOptimizerHook
forge script script/00_DeployYieldOptimizerHook.s.sol \
  --rpc-url http://localhost:8545 \
  --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

3. Note the **hook address** printed in the output. Use it in the app as `NEXT_PUBLIC_HOOK_ADDRESS` if you point the app at localhost (e.g. with a local frontend and Base RPC replaced by Anvil for demo).

For a “no RPC” demo you can keep the app on Vercel and only show the hook on Anvil (e.g. cast calls or a separate local UI).

### 2.3 Option B: Base (or other live chain)

Only use this if Uniswap v4 is deployed on that chain and addresses are configured in the template (e.g. in `AddressConstants` / `BaseScript`).

1. Create `.env` in `v4-template` (do not commit):

```bash
BASE_RPC_URL=https://mainnet.base.org
PRIVATE_KEY=0x...   # Or use --account and keystore
```

2. Deploy:

```bash
cd v4-template

forge script script/00_DeployYieldOptimizerHook.s.sol \
  --rpc-url $BASE_RPC_URL \
  --broadcast \
  --private-key $PRIVATE_KEY
```

3. Save the printed **hook address** and set it in Vercel as `NEXT_PUBLIC_HOOK_ADDRESS`.

### 2.4 After deployment

- **Owner**: The deployer is the hook’s `owner`. They can call `setBackendService()` and `setUserInvestmentAllocation()`.
- **Backend**: If you run an automated “idle liquidity” service, set its address with `setBackendService(backendAddress)`.
- **Frontend**: The app uses `NEXT_PUBLIC_HOOK_ADDRESS` to call `addLiquidityWithBasket`, `getPoolMetrics`, etc., when the user performs on-chain actions.

### 2.5 Deploy mock tokens and pools (Base Sepolia)

To test **normal swaps and basket swaps** on **Base Sepolia**, you need mock tokens and Uniswap v4 pools. The app uses the **Hookmate V4 Swap Router** (no extra hook needed for swaps).

1. In `v4-template`, set `PRIVATE_KEY` in `.env` (a Base Sepolia wallet with some ETH for gas).
2. Run:
   ```bash
   cd v4-template
   forge script script/04_DeployMockTokensAndPools.s.sol:DeployMockTokensAndPools \
     --rpc-url https://sepolia.base.org --broadcast
   ```
3. The script deploys **USDT, WETH, WBTC** and creates pools: **USDT–WETH**, **USDT–WBTC**, **WETH–WBTC**.
4. Copy the logged token addresses into `my-app/lib/constants/tokens.ts` (update the `address` field for USDT, WETH, WBTC in `TOKENS_BASE_SEPOLIA`). Pool keys are in `my-app/lib/constants/swap.ts`; they use the same token addresses, so no change needed there unless you add new tokens later.
5. Connect the app to **Base Sepolia**, connect your wallet, and use the Swap / Swap Basket UI. Path selection is **always optimal by estimated output** (direct vs via intermediate).

**Do I need to deploy a new Uniswap hook for swaps?** No. Normal swaps use the existing V4 router and your mock pools. The **YieldOptimizerHook** is only for the “invest with basket” / hook-specific features. For “swap USDT → WETH” or “basket USDT + WETH → WBTC”, the router and script 04 pools are enough.

**Adding more tokens (e.g. USDC, DAI):** Extend `04_DeployMockTokensAndPools.s.sol` to deploy more mocks and call `_createPoolAndAddLiquidity` for each new pair. Then add those tokens to `tokens.ts` and the new pool keys to `swap.ts` and `INTERMEDIATE_CANDIDATES` in `swap-path.ts`.

---

## 3. How the app uses the hook

- **Without hook deployed**: The site still works: AI chat, pool list, swap UI, and intent parsing all run. Only the parts that send transactions to the hook (e.g. “Invest” that calls `addLiquidityWithBasket`) need the contract.
- **With hook deployed**: Set `NEXT_PUBLIC_HOOK_ADDRESS` so the app can:
  - Call `addLiquidityWithBasket` for multi-token LP.
  - Read `getPoolMetrics` for pool stats.
  - (Backend) Call `investIdleLiquidity` / `withdrawInvestedLiquidity` if you set a backend service.

---

## 4. Quick checklist for demo day

- [ ] Repo pushed to GitHub.
- [ ] Vercel project created with **root = `my-app`**.
- [ ] `ANTHROPIC_API_KEY` set in Vercel.
- [ ] Deploy frontend; confirm URL loads and AI responds.
- [ ] (Optional) Anvil running; hook deployed with `00_DeployYieldOptimizerHook.s.sol`.
- [ ] (Optional) `NEXT_PUBLIC_HOOK_ADDRESS` set if you want in-app on-chain invest/swap.
- [ ] Rehearse: open app → show Home/Pools/Swap → use AI to ask for pools or swap intent → show hook on explorer or local UI if applicable.
