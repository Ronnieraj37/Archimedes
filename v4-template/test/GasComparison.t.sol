// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * Gas comparison: N separate swap txs (traditional) vs 1 basket swap tx (Archimedes).
 * Run with: forge test --match-contract GasComparisonTest -vvv
 * to see gas numbers in the logs.
 */
import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {CurrencyLibrary, Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {IPermit2} from "permit2/src/interfaces/IPermit2.sol";

import {EasyPosm} from "./utils/libraries/EasyPosm.sol";
import {BaseTest} from "./utils/BaseTest.sol";
import {Counter} from "../src/Counter.sol";
import {BasketSwapper} from "../src/BasketSwapper.sol";

contract GasComparisonTest is BaseTest {
    using EasyPosm for IPositionManager;
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using StateLibrary for IPoolManager;

    Counter hook;
    MockERC20 tokenA;
    MockERC20 tokenB;
    MockERC20 tokenC;
    MockERC20 tokenD;
    MockERC20 tokenE;
    PoolKey poolKeyA;
    PoolKey poolKeyB;
    PoolKey poolKeyD;
    PoolKey poolKeyE;
    BasketSwapper basketSwapper;

    uint256 tokenIdA;
    uint256 tokenIdB;
    uint256 tokenIdD;
    uint256 tokenIdE;
    int24 tickLower;
    int24 tickUpper;

    function setUp() public {
        deployArtifactsAndLabel();

        tokenA = new MockERC20("TokenA", "A", 18);
        tokenB = new MockERC20("TokenB", "B", 18);
        tokenC = new MockERC20("TokenC", "C", 18);
        tokenD = new MockERC20("TokenD", "D", 18);
        tokenE = new MockERC20("TokenE", "E", 18);
        tokenA.mint(address(this), 10_000_000 ether);
        tokenB.mint(address(this), 10_000_000 ether);
        tokenC.mint(address(this), 10_000_000 ether);
        tokenD.mint(address(this), 10_000_000 ether);
        tokenE.mint(address(this), 10_000_000 ether);
        tokenA.approve(address(permit2), type(uint256).max);
        tokenB.approve(address(permit2), type(uint256).max);
        tokenC.approve(address(permit2), type(uint256).max);
        tokenD.approve(address(permit2), type(uint256).max);
        tokenE.approve(address(permit2), type(uint256).max);
        tokenA.approve(address(swapRouter), type(uint256).max);
        tokenB.approve(address(swapRouter), type(uint256).max);
        tokenC.approve(address(swapRouter), type(uint256).max);
        tokenD.approve(address(swapRouter), type(uint256).max);
        tokenE.approve(address(swapRouter), type(uint256).max);
        permit2.approve(address(tokenA), address(positionManager), type(uint160).max, type(uint48).max);
        permit2.approve(address(tokenA), address(poolManager), type(uint160).max, type(uint48).max);
        permit2.approve(address(tokenB), address(positionManager), type(uint160).max, type(uint48).max);
        permit2.approve(address(tokenB), address(poolManager), type(uint160).max, type(uint48).max);
        permit2.approve(address(tokenC), address(positionManager), type(uint160).max, type(uint48).max);
        permit2.approve(address(tokenC), address(poolManager), type(uint160).max, type(uint48).max);
        permit2.approve(address(tokenD), address(positionManager), type(uint160).max, type(uint48).max);
        permit2.approve(address(tokenD), address(poolManager), type(uint160).max, type(uint48).max);
        permit2.approve(address(tokenE), address(positionManager), type(uint160).max, type(uint48).max);
        permit2.approve(address(tokenE), address(poolManager), type(uint160).max, type(uint48).max);

        address flags = address(
            uint160(
                Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG
                    | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
            ) ^ (0x4444 << 144)
        );
        deployCodeTo("Counter.sol:Counter", abi.encode(poolManager), flags);
        hook = Counter(flags);

        (PoolKey memory pkA, PoolKey memory pkB, PoolKey memory pkD, PoolKey memory pkE) = _createPools();
        poolKeyA = pkA;
        poolKeyB = pkB;
        poolKeyD = pkD;
        poolKeyE = pkE;

        basketSwapper = new BasketSwapper(address(swapRouter));
        tokenA.approve(address(basketSwapper), type(uint256).max);
        tokenB.approve(address(basketSwapper), type(uint256).max);
        tokenD.approve(address(basketSwapper), type(uint256).max);
        tokenE.approve(address(basketSwapper), type(uint256).max);
    }

    function _createPools() internal returns (PoolKey memory pkA, PoolKey memory pkB, PoolKey memory pkD, PoolKey memory pkE) {
        pkA = _poolFor(address(tokenA), address(tokenC));
        pkB = _poolFor(address(tokenB), address(tokenC));
        pkD = _poolFor(address(tokenD), address(tokenC));
        pkE = _poolFor(address(tokenE), address(tokenC));
        poolManager.initialize(pkA, Constants.SQRT_PRICE_1_1);
        poolManager.initialize(pkB, Constants.SQRT_PRICE_1_1);
        poolManager.initialize(pkD, Constants.SQRT_PRICE_1_1);
        poolManager.initialize(pkE, Constants.SQRT_PRICE_1_1);
        tickLower = TickMath.minUsableTick(60);
        tickUpper = TickMath.maxUsableTick(60);
        uint128 liq = 100e18;
        (uint256 amt0, uint256 amt1) = LiquidityAmounts.getAmountsForLiquidity(
            Constants.SQRT_PRICE_1_1,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            liq
        );
        (tokenIdA,) = positionManager.mint(
            pkA, tickLower, tickUpper, liq, amt0 + 1, amt1 + 1, address(this), block.timestamp, Constants.ZERO_BYTES
        );
        (tokenIdB,) = positionManager.mint(
            pkB, tickLower, tickUpper, liq, amt0 + 1, amt1 + 1, address(this), block.timestamp, Constants.ZERO_BYTES
        );
        (tokenIdD,) = positionManager.mint(
            pkD, tickLower, tickUpper, liq, amt0 + 1, amt1 + 1, address(this), block.timestamp, Constants.ZERO_BYTES
        );
        (tokenIdE,) = positionManager.mint(
            pkE, tickLower, tickUpper, liq, amt0 + 1, amt1 + 1, address(this), block.timestamp, Constants.ZERO_BYTES
        );
    }

    function _poolFor(address input, address output) internal view returns (PoolKey memory) {
        (address c0, address c1) = input < output ? (input, output) : (output, input);
        return PoolKey(Currency.wrap(c0), Currency.wrap(c1), 3000, 60, IHooks(hook));
    }

    function test_Gas_Traditional_TwoSeparateSwaps() public {
        uint256 amountIn = 1e18;
        uint256 g0 = gasleft();
        swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: _zeroForOne(poolKeyA, address(tokenA)),
            poolKey: poolKeyA,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
        uint256 gas1 = g0 - gasleft();

        g0 = gasleft();
        swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: _zeroForOne(poolKeyB, address(tokenB)),
            poolKey: poolKeyB,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
        uint256 gas2 = g0 - gasleft();

        uint256 totalTraditional = gas1 + gas2;
        console2.log("=== Traditional (2 separate swap txs in same block) ===");
        console2.log("  Swap 1 gas:", gas1);
        console2.log("  Swap 2 gas:", gas2);
        console2.log("  Total gas (sum):", totalTraditional);
        console2.log("  (In reality 2 txs would add ~21k base each = +21k vs single tx)");
    }

    function test_Gas_Basket_OneTx() public {
        uint256 amountIn = 1e18;
        BasketSwapper.SwapInput[] memory inputs = new BasketSwapper.SwapInput[](2);
        inputs[0] = BasketSwapper.SwapInput({
            token: address(tokenA),
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: _zeroForOne(poolKeyA, address(tokenA)),
            poolKey: _toBasketPoolKey(poolKeyA)
        });
        inputs[1] = BasketSwapper.SwapInput({
            token: address(tokenB),
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: _zeroForOne(poolKeyB, address(tokenB)),
            poolKey: _toBasketPoolKey(poolKeyB)
        });

        uint256 g0 = gasleft();
        basketSwapper.basketSwap(inputs, address(this), block.timestamp + 1);
        uint256 gasBasket = g0 - gasleft();

        console2.log("=== Basket (1 tx, 2 sub-swaps) ===");
        console2.log("  Basket swap gas:", gasBasket);
    }

    function test_Gas_Comparison_Verbose() public {
        uint256 amountIn = 1e18;

        uint256 g0 = gasleft();
        swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: _zeroForOne(poolKeyA, address(tokenA)),
            poolKey: poolKeyA,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
        uint256 gas1 = g0 - gasleft();

        g0 = gasleft();
        swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: _zeroForOne(poolKeyB, address(tokenB)),
            poolKey: poolKeyB,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
        uint256 gas2 = g0 - gasleft();

        BasketSwapper.SwapInput[] memory inputs = new BasketSwapper.SwapInput[](2);
        inputs[0] = BasketSwapper.SwapInput({
            token: address(tokenA),
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: _zeroForOne(poolKeyA, address(tokenA)),
            poolKey: _toBasketPoolKey(poolKeyA)
        });
        inputs[1] = BasketSwapper.SwapInput({
            token: address(tokenB),
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: _zeroForOne(poolKeyB, address(tokenB)),
            poolKey: _toBasketPoolKey(poolKeyB)
        });

        g0 = gasleft();
        basketSwapper.basketSwap(inputs, address(this), block.timestamp + 1);
        uint256 gasBasket = g0 - gasleft();

        uint256 totalTraditional = gas1 + gas2;
        uint256 saved = totalTraditional > gasBasket ? totalTraditional - gasBasket : 0;
        uint256 pct = totalTraditional > 0 ? (saved * 100) / totalTraditional : 0;

        console2.log("========== GAS COMPARISON (2 tokens -> 1 output) ==========");
        console2.log("Traditional swap 1:     ", gas1);
        console2.log("Traditional swap 2:     ", gas2);
        console2.log("Traditional total (sum):", totalTraditional);
        console2.log("Basket (1 tx):          ", gasBasket);
        console2.log("Saved (same-block):     ", saved);
        console2.log("Saved percent:          ", pct, "%");
        console2.log("---");
        console2.log("Note: 2 real txs would pay base 21k twice. Single basket pays once.");
        console2.log("So real-world saving >= (21000 + saved) when N=2.");
    }

    function test_Gas_Comparison_3Tokens() public {
        uint256 amountIn = 1e18;
        uint256 g0 = gasleft();
        swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: _zeroForOne(poolKeyA, address(tokenA)),
            poolKey: poolKeyA,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
        uint256 gas1 = g0 - gasleft();
        g0 = gasleft();
        swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: _zeroForOne(poolKeyB, address(tokenB)),
            poolKey: poolKeyB,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
        uint256 gas2 = g0 - gasleft();
        g0 = gasleft();
        swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: _zeroForOne(poolKeyD, address(tokenD)),
            poolKey: poolKeyD,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
        uint256 gas3 = g0 - gasleft();

        BasketSwapper.SwapInput[] memory inputs = new BasketSwapper.SwapInput[](3);
        inputs[0] = BasketSwapper.SwapInput({
            token: address(tokenA),
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: _zeroForOne(poolKeyA, address(tokenA)),
            poolKey: _toBasketPoolKey(poolKeyA)
        });
        inputs[1] = BasketSwapper.SwapInput({
            token: address(tokenB),
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: _zeroForOne(poolKeyB, address(tokenB)),
            poolKey: _toBasketPoolKey(poolKeyB)
        });
        inputs[2] = BasketSwapper.SwapInput({
            token: address(tokenD),
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: _zeroForOne(poolKeyD, address(tokenD)),
            poolKey: _toBasketPoolKey(poolKeyD)
        });
        g0 = gasleft();
        basketSwapper.basketSwap(inputs, address(this), block.timestamp + 1);
        uint256 gasBasket = g0 - gasleft();

        uint256 totalTrad = gas1 + gas2 + gas3;
        uint256 baseCost3Txs = 21_000 * 3;
        uint256 baseCost1Tx = 21_000;
        console2.log("========== GAS COMPARISON (3 tokens -> 1 output) ==========");
        console2.log("Traditional swap 1:     ", gas1);
        console2.log("Traditional swap 2:     ", gas2);
        console2.log("Traditional swap 3:     ", gas3);
        console2.log("Traditional total (sum):", totalTrad);
        console2.log("Basket (1 tx):          ", gasBasket);
        console2.log("With base: 3 txs =      ", baseCost3Txs + totalTrad);
        console2.log("With base: 1 basket =   ", baseCost1Tx + gasBasket);
    }

    function test_Gas_Comparison_4Tokens() public {
        uint256 amountIn = 1e18;
        uint256 g0 = gasleft();
        swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: _zeroForOne(poolKeyA, address(tokenA)),
            poolKey: poolKeyA,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
        uint256 gas1 = g0 - gasleft();
        g0 = gasleft();
        swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: _zeroForOne(poolKeyB, address(tokenB)),
            poolKey: poolKeyB,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
        uint256 gas2 = g0 - gasleft();
        g0 = gasleft();
        swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: _zeroForOne(poolKeyD, address(tokenD)),
            poolKey: poolKeyD,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
        uint256 gas3 = g0 - gasleft();
        g0 = gasleft();
        swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: _zeroForOne(poolKeyE, address(tokenE)),
            poolKey: poolKeyE,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
        uint256 gas4 = g0 - gasleft();

        BasketSwapper.SwapInput[] memory inputs = new BasketSwapper.SwapInput[](4);
        inputs[0] = BasketSwapper.SwapInput({
            token: address(tokenA),
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: _zeroForOne(poolKeyA, address(tokenA)),
            poolKey: _toBasketPoolKey(poolKeyA)
        });
        inputs[1] = BasketSwapper.SwapInput({
            token: address(tokenB),
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: _zeroForOne(poolKeyB, address(tokenB)),
            poolKey: _toBasketPoolKey(poolKeyB)
        });
        inputs[2] = BasketSwapper.SwapInput({
            token: address(tokenD),
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: _zeroForOne(poolKeyD, address(tokenD)),
            poolKey: _toBasketPoolKey(poolKeyD)
        });
        inputs[3] = BasketSwapper.SwapInput({
            token: address(tokenE),
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: _zeroForOne(poolKeyE, address(tokenE)),
            poolKey: _toBasketPoolKey(poolKeyE)
        });
        g0 = gasleft();
        basketSwapper.basketSwap(inputs, address(this), block.timestamp + 1);
        uint256 gasBasket = g0 - gasleft();

        uint256 totalTrad = gas1 + gas2 + gas3 + gas4;
        uint256 baseCost4Txs = 21_000 * 4;
        uint256 baseCost1Tx = 21_000;
        console2.log("========== GAS COMPARISON (4 tokens -> 1 output) ==========");
        console2.log("Traditional swap 1:     ", gas1);
        console2.log("Traditional swap 2:     ", gas2);
        console2.log("Traditional swap 3:     ", gas3);
        console2.log("Traditional swap 4:     ", gas4);
        console2.log("Traditional total (sum):", totalTrad);
        console2.log("Basket (1 tx):          ", gasBasket);
        console2.log("With base: 4 txs =      ", baseCost4Txs + totalTrad);
        console2.log("With base: 1 basket =   ", baseCost1Tx + gasBasket);
    }

    function _zeroForOne(PoolKey memory pk, address inputToken) internal pure returns (bool) {
        return Currency.unwrap(pk.currency0) == inputToken;
    }

    function _toBasketPoolKey(PoolKey memory pk) internal pure returns (BasketSwapper.PoolKeyInput memory) {
        return BasketSwapper.PoolKeyInput({
            currency0: Currency.unwrap(pk.currency0),
            currency1: Currency.unwrap(pk.currency1),
            fee: pk.fee,
            tickSpacing: pk.tickSpacing,
            hooks: address(pk.hooks)
        });
    }
}
