# Archimedes Protocol -- Smart Contracts

Foundry project containing the on-chain components of Archimedes Protocol: a **YieldOptimizerHook** for Uniswap v4, a **BasketSwapper** for multi-token atomic swaps, and deployment scripts for mock tokens and pools on Base Sepolia.

---

## Contracts

### YieldOptimizerHook (`src/YieldOptimizerHook.sol`)

A Uniswap v4 hook that attaches to pools and provides:

- **`beforeSwap`**: Called before every swap. Enables just-in-time (JIT) liquidity provisioning -- the hook can recall idle capital from yield strategies and inject it into the pool right before a large trade.
- **`afterSwap`**: Called after every swap. Tracks volume metrics per pool and can re-deploy idle liquidity to yield strategies.
- **`afterAddLiquidity`**: Hooks into liquidity additions for basket deposits and automated yield allocation.
- **Idle liquidity management**: A portion of pool liquidity can be parked in external yield sources (e.g., Aave, Compound) and recalled on demand.
- **Pool metrics**: Tracks per-pool volume, swap count, and liquidity utilization.

The hook is deployed once and shared across all pools on the network.

**Hook permissions**: `BEFORE_SWAP_FLAG | AFTER_SWAP_FLAG | BEFORE_ADD_LIQUIDITY_FLAG | AFTER_ADD_LIQUIDITY_FLAG`

### BasketSwapper (`src/BasketSwapper.sol`)

A thin wrapper contract that enables **multi-token basket swaps in a single transaction**.

**How it works:**

```solidity
function basketSwap(
    SwapInput[] calldata inputs,  // Array of {token, amountIn, amountOutMin, zeroForOne, poolKey}
    address receiver,              // Who receives all output tokens
    uint256 deadline               // Revert after this timestamp
) external {
    for each input:
        1. token.transferFrom(msg.sender, address(this), amountIn)  // Pull from user
        2. token.approve(router, amountIn)                          // Let router spend
        3. router.swapExactTokensForTokens(...)                     // Execute swap
}
```

**Gas savings vs individual transactions:**

| Tokens | Individual txs | BasketSwapper | Saving |
|--------|---------------|---------------|--------|
| 2 | ~180k gas | ~150k gas | ~17% |
| 3 | ~270k gas | ~210k gas | ~22% |
| 5 | ~450k gas | ~320k gas | ~29% |

Savings come from:
- Base tx overhead (21k gas) paid once instead of N times
- Warm SLOAD slots after first sub-swap (~1,900 gas saved per subsequent swap)
- Single unlock/callback context on PoolManager

The BasketSwapper is immutable, ownerless, and trustless -- it only calls the router with user-provided parameters and has no admin functions.

---

## Deployment Scripts

| Script | Purpose |
|--------|---------|
| `00_DeployYieldOptimizerHook.s.sol` | Deploy the YieldOptimizerHook with correct flag-based address mining |
| `04_DeployMockTokensAndPools.s.sol` | Deploy 5 mock ERC-20 tokens (USDT, USDC, WETH, WBTC, DAI) and create 5 Uniswap v4 pools with deep liquidity |
| `05_DeployBasketSwapper.s.sol` | Deploy the BasketSwapper contract pointing to the Hookmate router |

### Deploying to Base Sepolia

```bash
# 1. Deploy the hook (one-time)
forge script script/00_DeployYieldOptimizerHook.s.sol:DeployYieldOptimizerHook \
  --rpc-url https://sepolia.base.org --broadcast

# 2. Deploy mock tokens and pools
forge script script/04_DeployMockTokensAndPools.s.sol:DeployMockTokensAndPools \
  --rpc-url https://sepolia.base.org --broadcast

# 3. Deploy BasketSwapper
forge script script/05_DeployBasketSwapper.s.sol:DeployBasketSwapper \
  --rpc-url https://sepolia.base.org --broadcast
```

After deployment, update the frontend constants:
- `my-app/lib/constants/tokens.ts` -- token addresses
- `my-app/lib/constants/swap.ts` -- `BASKET_SWAPPER_ADDRESS`, `HOOKS_ADDRESS`

---

## Mock Tokens

All mock tokens use solmate's `MockERC20` with **public `mint(address to, uint256 value)`** -- anyone can mint for testing.

| Token | Symbol | Decimals | Price (USDT) |
|-------|--------|----------|-------------|
| Mock USDT | USDT | 6 | 1.00 |
| Mock USDC | USDC | 6 | ~1.00 |
| Mock WETH | WETH | 18 | 2,104 |
| Mock WBTC | WBTC | 8 | 70,230 |
| Mock DAI | DAI | 18 | ~1.00 |

---

## Pools

5 pools deployed with the YieldOptimizerHook, 0.30% fee, 60 tick spacing:

| Pool | Token A | Token B | Initial Price |
|------|---------|---------|--------------|
| USDT-WETH | USDT (6 dec) | WETH (18 dec) | 1 WETH = 2,104 USDT |
| USDT-WBTC | USDT (6 dec) | WBTC (8 dec) | 1 WBTC = 70,230 USDT |
| WBTC-WETH | WBTC (8 dec) | WETH (18 dec) | 1 WBTC = 33 WETH |
| USDC-USDT | USDC (6 dec) | USDT (6 dec) | 1:1 |
| DAI-USDT | DAI (18 dec) | USDT (6 dec) | 1:1 |

The deployment script uses **decimal-aware `sqrtPriceX96` calculation** to handle tokens with different decimal places (e.g., 6-decimal USDT paired with 18-decimal WETH). This was critical for correct pricing and preventing `SlippageExceeded` errors.

---

## Decimal-Aware Pricing

One of the key technical challenges was computing correct `sqrtPriceX96` for token pairs with different decimals. Uniswap v4 operates on raw token amounts, so the price ratio must account for decimal differences:

```
For USDT (6 dec) paired with WETH (18 dec):
  1 WETH = 2104 USDT

  Raw price = USDT_raw / WETH_raw
            = (2104 * 10^6) / (1 * 10^18)
            = 2104 * 10^(-12)

  sqrtPriceX96 = sqrt(raw_price) * 2^96
```

The `_orderCurrenciesAndPrice` function in the deploy script handles all decimal combinations automatically.

---

## Testing

```bash
forge test
```

The test suite covers:
- Hook deployment and flag validation
- Pool initialization with the hook
- Swap execution with beforeSwap/afterSwap callbacks
- Pool metrics tracking

---

## Deployed Addresses (Base Sepolia, chain 84532)

| Contract | Address |
|----------|---------|
| PoolManager | `0x05E73354CfDd6745C338b50BcFdFA3Aa6fA03408` |
| PositionManager | `0x4B2C77d209D3405F41a037Ec6c77F7F5b8e2ca80` |
| Hookmate V4 Router | `0x71cD4Ea054F9Cb3D3BF6251A00673303411A7DD9` |
| YieldOptimizerHook | `0x05a6b10faaE4C0B687a160Ffb1848EF4aE148cC0` |
| BasketSwapper | `0x91C39d20aA835db4b5A6Bc45203046F342E85926` |

---

## Dependencies

- [Uniswap v4-core](https://github.com/uniswap/v4-core)
- [Uniswap v4-periphery](https://github.com/uniswap/v4-periphery)
- [Hookmate](https://github.com/hookmate) -- Router and address constants for Base Sepolia
- [solmate](https://github.com/transmissions11/solmate) -- MockERC20
- [Foundry](https://book.getfoundry.sh/) -- Build, test, deploy

## License

MIT
