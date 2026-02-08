// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {CurrencyLibrary, Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

import {EasyPosm} from "./utils/libraries/EasyPosm.sol";
import {BaseTest} from "./utils/BaseTest.sol";
import {YieldOptimizerHook} from "../src/YieldOptimizerHook.sol";

contract YieldOptimizerHookTest is BaseTest {
    using EasyPosm for IPositionManager;
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using StateLibrary for IPoolManager;

    Currency currency0;
    Currency currency1;

    PoolKey poolKey;
    YieldOptimizerHook hook;
    PoolId poolId;

    uint256 tokenId;
    int24 tickLower;
    int24 tickUpper;
    
    address backendService;
    address testUser;

    function setUp() public {
        // Deploys all required artifacts.
        deployArtifactsAndLabel();

        (currency0, currency1) = deployCurrencyPair();
        
        // Setup test addresses
        backendService = address(0x1234);
        testUser = address(0x5678);

        // Deploy the hook to an address with the correct flags
        address flags = address(
            uint160(
                Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | 
                Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.AFTER_ADD_LIQUIDITY_FLAG
            ) ^ (0x4444 << 144) // Namespace the hook to avoid collisions
        );
        bytes memory constructorArgs = abi.encode(poolManager);
        deployCodeTo("YieldOptimizerHook.sol:YieldOptimizerHook", constructorArgs, flags);
        hook = YieldOptimizerHook(flags);

        // Create the pool
        poolKey = PoolKey(currency0, currency1, 3000, 60, IHooks(hook));
        poolId = poolKey.toId();
        poolManager.initialize(poolKey, Constants.SQRT_PRICE_1_1);

        // Provide full-range liquidity to the pool
        tickLower = TickMath.minUsableTick(poolKey.tickSpacing);
        tickUpper = TickMath.maxUsableTick(poolKey.tickSpacing);

        uint128 liquidityAmount = 100e18;

        (uint256 amount0Expected, uint256 amount1Expected) = LiquidityAmounts.getAmountsForLiquidity(
            Constants.SQRT_PRICE_1_1,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            liquidityAmount
        );

        (tokenId,) = positionManager.mint(
            poolKey,
            tickLower,
            tickUpper,
            liquidityAmount,
            amount0Expected + 1,
            amount1Expected + 1,
            address(this),
            block.timestamp,
            Constants.ZERO_BYTES
        );
    }

    // ============ ADMIN FUNCTION TESTS ============
    
    function test_SetBackendService() public {
        hook.setBackendService(backendService);
        assertEq(hook.backendService(), backendService);
    }
    
    function test_SetBackendService_OnlyOwner() public {
        vm.prank(address(0x9999));
        vm.expectRevert(YieldOptimizerHook.Unauthorized.selector);
        hook.setBackendService(backendService);
    }
    
    function test_SetUserInvestmentAllocation() public {
        hook.setUserInvestmentAllocation(testUser, 3000); // 30%
        assertEq(hook.getUserAllocation(testUser), 3000);
    }
    
    function test_SetUserInvestmentAllocation_Max50Percent() public {
        hook.setUserInvestmentAllocation(testUser, 5000); // 50% - should work
        assertEq(hook.getUserAllocation(testUser), 5000);
        
        // Try to set > 50% - should revert
        vm.expectRevert(YieldOptimizerHook.InvalidBasket.selector);
        hook.setUserInvestmentAllocation(testUser, 5001);
    }
    
    function test_SetUserInvestmentAllocation_OnlyOwner() public {
        vm.prank(address(0x9999));
        vm.expectRevert(YieldOptimizerHook.Unauthorized.selector);
        hook.setUserInvestmentAllocation(testUser, 3000);
    }

    // ============ INVESTMENT FUNCTION TESTS ============
    
    function test_InvestIdleLiquidity() public {
        hook.setBackendService(backendService);
        
        uint256 investAmount = 1000e18;
        address platform = address(0xAABB);
        
        vm.prank(backendService);
        hook.investIdleLiquidity(poolKey, currency0, investAmount, platform);
        
        // Check that position was created
        YieldOptimizerHook.IdlePosition[] memory positions = hook.getIdlePositions(poolId);
        assertEq(positions.length, 1);
        assertEq(positions[0].platform, platform);
        assertTrue(Currency.unwrap(positions[0].currency) == Currency.unwrap(currency0));
        assertEq(positions[0].amount, investAmount);
        
        // Check total invested
        assertEq(hook.getTotalInvested(poolId), investAmount);
    }
    
    function test_InvestIdleLiquidity_OnlyBackend() public {
        hook.setBackendService(backendService);
        
        vm.prank(address(0x9999));
        vm.expectRevert(YieldOptimizerHook.Unauthorized.selector);
        hook.investIdleLiquidity(poolKey, currency0, 1000e18, address(0xAABB));
    }
    
    function test_WithdrawInvestedLiquidity() public {
        hook.setBackendService(backendService);
        
        uint256 investAmount = 1000e18;
        address platform = address(0xAABB);
        
        // First invest
        vm.prank(backendService);
        hook.investIdleLiquidity(poolKey, currency0, investAmount, platform);
        
        // Then withdraw half
        uint256 withdrawAmount = 500e18;
        vm.prank(backendService);
        hook.withdrawInvestedLiquidity(poolKey, 0, withdrawAmount);
        
        // Check position updated
        YieldOptimizerHook.IdlePosition[] memory positions = hook.getIdlePositions(poolId);
        assertEq(positions.length, 1);
        assertEq(positions[0].amount, investAmount - withdrawAmount);
        
        // Check total invested
        assertEq(hook.getTotalInvested(poolId), investAmount - withdrawAmount);
    }
    
    function test_WithdrawInvestedLiquidity_FullyWithdrawn() public {
        hook.setBackendService(backendService);
        
        uint256 investAmount = 1000e18;
        address platform = address(0xAABB);
        
        // Invest
        vm.prank(backendService);
        hook.investIdleLiquidity(poolKey, currency0, investAmount, platform);
        
        // Fully withdraw
        vm.prank(backendService);
        hook.withdrawInvestedLiquidity(poolKey, 0, investAmount);
        
        // Position should be removed
        YieldOptimizerHook.IdlePosition[] memory positions = hook.getIdlePositions(poolId);
        assertEq(positions.length, 0);
        assertEq(hook.getTotalInvested(poolId), 0);
    }
    
    function test_WithdrawInvestedLiquidity_InvalidPosition() public {
        hook.setBackendService(backendService);
        
        vm.prank(backendService);
        vm.expectRevert();
        hook.withdrawInvestedLiquidity(poolKey, 999, 100e18);
    }
    
    function test_WithdrawInvestedLiquidity_InsufficientAmount() public {
        hook.setBackendService(backendService);
        
        uint256 investAmount = 1000e18;
        
        vm.prank(backendService);
        hook.investIdleLiquidity(poolKey, currency0, investAmount, address(0xAABB));
        
        vm.prank(backendService);
        vm.expectRevert();
        hook.withdrawInvestedLiquidity(poolKey, 0, investAmount + 1);
    }

    // ============ POOL METRICS TESTS ============
    
    function test_GetPoolMetrics() public {
        (uint256 volume, uint256 threshold, uint256 lastCheck) = hook.getPoolMetrics(poolId);
        
        // Volume should be 0 initially
        assertEq(volume, 0);
        // Threshold should be 0 initially
        assertEq(threshold, 0);
        // lastCheck should be > 0 because setUp() calls beforeAddLiquidity
        assertGt(lastCheck, 0);
    }
    
    function test_SetVolumeThreshold() public {
        uint256 threshold = 10000e18;
        hook.setVolumeThreshold(poolId, threshold);
        
        (uint256 volume, uint256 thresholdRead, uint256 lastCheck) = hook.getPoolMetrics(poolId);
        assertEq(thresholdRead, threshold);
    }

    // ============ HOOK CALLBACK TESTS ============
    
    function test_BeforeAddLiquidity() public {
        // Add liquidity should trigger beforeAddLiquidity hook
        uint128 newLiquidity = 10e18;
        
        (uint256 amount0Expected, uint256 amount1Expected) = LiquidityAmounts.getAmountsForLiquidity(
            Constants.SQRT_PRICE_1_1,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            newLiquidity
        );
        
        positionManager.mint(
            poolKey,
            tickLower,
            tickUpper,
            newLiquidity,
            amount0Expected + 1,
            amount1Expected + 1,
            address(this),
            block.timestamp,
            Constants.ZERO_BYTES
        );
        
        // Check that lastVolumeCheck was updated
        (,, uint256 lastCheck) = hook.getPoolMetrics(poolId);
        assertGt(lastCheck, 0);
    }
    
    function test_BeforeSwap_UpdatesVolume() public {
        // Set volume threshold
        hook.setVolumeThreshold(poolId, 1000e18);
        
        // Perform a swap
        uint256 amountIn = 1e18;
        swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
        
        // Check volume was updated
        (uint256 volume,,) = hook.getPoolMetrics(poolId);
        assertGe(volume, amountIn);
    }
}
