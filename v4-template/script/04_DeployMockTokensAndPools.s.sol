// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {CurrencyLibrary, Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IPermit2} from "permit2/src/interfaces/IPermit2.sol";
import {AddressConstants} from "hookmate/constants/AddressConstants.sol";

/**
 * Deploys mock tokens (USDT, USDC, WETH, WBTC, DAI) on Base Sepolia and creates
 * Uniswap v4 pools. Ratios MUST match my-app/lib/constants/tokens.ts TOKEN_PRICES_USDT:
 *   USDT=1, USDC≈1.0007, WETH=2104, WBTC=70230, DAI≈1.0006
 *
 * Pools created (must match my-app POOL_PAIRS — keys are alphabetically sorted):
 *   DAI-USDT, USDC-USDT, USDT-WBTC, USDT-WETH, WETH-WBTC
 *
 * Mock tokens use solmate MockERC20: mint(to, value) is public — anyone can mint
 * (for testing only). The frontend "Get tokens" section lets users mint to themselves.
 *
 * Run on Base Sepolia:
 *   forge script script/04_DeployMockTokensAndPools.s.sol:DeployMockTokensAndPools \
 *     --rpc-url https://sepolia.base.org --broadcast
 *
 * Then update my-app/lib/constants/tokens.ts with the logged addresses.
 */
contract DeployMockTokensAndPools is Script {
    using CurrencyLibrary for Currency;

    uint256 constant BASE_SEPOLIA = 84532;

    // Price ratios (per 1 unit of the asset, in tokenA)
    uint256 constant USDT_PER_WETH = 2104;
    uint256 constant USDT_PER_WBTC = 70_230;
    // WETH per 1 WBTC (70230/2104 ≈ 33.39) for WETH/WBTC pool
    uint256 constant WETH_PER_WBTC = 33;
    // Stables ~1:1 (use 1 for integer math)
    uint256 constant USDT_PER_USDC = 1;
    uint256 constant USDT_PER_DAI  = 1;

    uint24 constant LP_FEE = 3000;   // 0.30%
    int24 constant TICK_SPACING = 60;

    /// @dev YieldOptimizerHook deployed on Base Sepolia via 00_DeployYieldOptimizerHook.s.sol
    address constant HOOK_ADDRESS = 0x05a6b10faaE4C0B687a160Ffb1848EF4aE148cC0;

    IPermit2 permit2;
    IPoolManager poolManager;
    IPositionManager positionManager;

    MockERC20 public mockUSDT;
    MockERC20 public mockUSDC;
    MockERC20 public mockWETH;
    MockERC20 public mockWBTC;
    MockERC20 public mockDAI;

    function run() external {
        require(block.chainid == BASE_SEPOLIA, "Run on Base Sepolia only");

        (permit2, poolManager, positionManager) = _getContracts();
        address deployer = vm.addr(vm.envUint("PRIVATE_KEY"));

        vm.startBroadcast();

        // 1) Deploy mock tokens
        mockUSDT = new MockERC20("Mock USDT", "USDT", 6);
        mockUSDC = new MockERC20("Mock USDC", "USDC", 6);
        mockWETH = new MockERC20("Mock WETH", "WETH", 18);
        mockWBTC = new MockERC20("Mock WBTC", "WBTC", 8);
        mockDAI  = new MockERC20("Mock DAI", "DAI", 18);

        console2.log("Mock USDT:", address(mockUSDT));
        console2.log("Mock USDC:", address(mockUSDC));
        console2.log("Mock WETH:", address(mockWETH));
        console2.log("Mock WBTC:", address(mockWBTC));
        console2.log("Mock DAI:", address(mockDAI));

        // Mint enough for deployer to add liquidity to all pools (USDT is in 4 pools: ~11.2M needed)
        uint256 mintAmount = 10_000_000;
        mockUSDT.mint(deployer, 20_000_000 * 1e6);   // 20M USDT (pools need ~11.2M)
        mockUSDC.mint(deployer, mintAmount * 1e6);
        mockWETH.mint(deployer, mintAmount * 1e18);
        mockWBTC.mint(deployer, mintAmount * 1e8);
        mockDAI.mint(deployer, mintAmount * 1e18);

        // 2) Approve tokens for Permit2 and PositionManager
        _approveToken(IERC20(address(mockUSDT)), deployer);
        _approveToken(IERC20(address(mockUSDC)), deployer);
        _approveToken(IERC20(address(mockWETH)), deployer);
        _approveToken(IERC20(address(mockWBTC)), deployer);
        _approveToken(IERC20(address(mockDAI)), deployer);

        // 3) Create USDT/WETH pool at 1 WETH = 2104 USDT — large liquidity to reduce slippage
        _createPoolAndAddLiquidity(
            IERC20(address(mockUSDT)), 6,
            IERC20(address(mockWETH)), 18,
            USDT_PER_WETH,
            2_104_000 * 1e6, // 2.1M USDT
            1000 * 1e18,     // 1000 WETH
            deployer
        );

        // 4) Create USDT/WBTC pool at 1 WBTC = 70230 USDT — large liquidity
        _createPoolAndAddLiquidity(
            IERC20(address(mockUSDT)), 6,
            IERC20(address(mockWBTC)), 8,
            USDT_PER_WBTC,
            7_023_000 * 1e6, // ~7M USDT
            100 * 1e8,       // 100 WBTC
            deployer
        );

        // 5) Create WETH/WBTC pool at 1 WBTC = 33 WETH — large liquidity
        _createPoolAndAddLiquidity(
            IERC20(address(mockWETH)), 18,
            IERC20(address(mockWBTC)), 8,
            WETH_PER_WBTC,
            3300 * 1e18,    // 3300 WETH
            100 * 1e8,       // 100 WBTC
            deployer
        );

        // 6) USDC/USDT ~1:1 — deep stable pool
        _createPoolAndAddLiquidity(
            IERC20(address(mockUSDT)), 6,
            IERC20(address(mockUSDC)), 6,
            USDT_PER_USDC,
            1_000_000 * 1e6, // 1M USDT
            1_000_000 * 1e6, // 1M USDC
            deployer
        );

        // 7) DAI/USDT ~1:1 — deep stable pool
        _createPoolAndAddLiquidity(
            IERC20(address(mockUSDT)), 6,
            IERC20(address(mockDAI)), 18,
            USDT_PER_DAI,
            1_000_000 * 1e6,
            1_000_000 * 1e18,
            deployer
        );

        vm.stopBroadcast();
    }

    function _getContracts()
        internal
        view
        returns (IPermit2 p2, IPoolManager pm, IPositionManager posm)
    {
        p2 = IPermit2(AddressConstants.getPermit2Address());
        pm = IPoolManager(AddressConstants.getPoolManagerAddress(block.chainid));
        posm = IPositionManager(AddressConstants.getPositionManagerAddress(block.chainid));
    }

    function _approveToken(IERC20 token, address owner) internal {
        token.approve(address(permit2), type(uint256).max);
        permit2.approve(address(token), address(positionManager), type(uint160).max, type(uint48).max);
    }

    function _createPoolAndAddLiquidity(
        IERC20 tokenA, uint8 decimalsA,
        IERC20 tokenB, uint8 decimalsB,
        uint256 aPerUnitOfB,
        uint256 amountA,
        uint256 amountB,
        address recipient
    ) internal {
        (Currency currency0, Currency currency1, uint160 sqrtPriceX96, uint256 amount0, uint256 amount1) =
            _orderCurrenciesAndPrice(tokenA, decimalsA, tokenB, decimalsB, aPerUnitOfB, amountA, amountB);

        PoolKey memory poolKey = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: LP_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(HOOK_ADDRESS)
        });

        int24 currentTick = TickMath.getTickAtSqrtPrice(sqrtPriceX96);
        int24 tickLower = _truncateTickSpacing(currentTick - 750 * TICK_SPACING, TICK_SPACING);
        int24 tickUpper = _truncateTickSpacing(currentTick + 750 * TICK_SPACING, TICK_SPACING);

        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            amount0,
            amount1
        );

        MintLiquidityArgs memory mintArgs = MintLiquidityArgs({
            poolKey: poolKey,
            tickLower: tickLower,
            tickUpper: tickUpper,
            liquidity: liquidity,
            amount0Max: amount0 + 1,
            amount1Max: amount1 + 1,
            recipient: recipient
        });
        (bytes memory actions, bytes[] memory mintParams) = _mintLiquidityParams(mintArgs);

        bytes[] memory params = new bytes[](2);
        params[0] = abi.encodeWithSelector(positionManager.initializePool.selector, poolKey, sqrtPriceX96, "");
        params[1] = abi.encodeWithSelector(
            positionManager.modifyLiquidities.selector, abi.encode(actions, mintParams), block.timestamp + 3600
        );

        positionManager.multicall(params);
    }

    /**
     * @dev Order so currency0 < currency1 by address; return sqrtPriceX96 accounting for
     *      different token decimals.
     *
     *      price_raw = currency1_raw / currency0_raw
     *
     *      Given: 1 human unit of B = aPerUnitOfB human units of A.
     *
     *      Case 1 (tokenA < tokenB): currency0=A, currency1=B
     *        price_raw = B_raw / A_raw = 10^(decB - decA) / aPerUnitOfB
     *
     *      Case 2 (tokenB < tokenA): currency0=B, currency1=A
     *        price_raw = A_raw / B_raw = aPerUnitOfB * 10^(decA - decB)
     */
    function _orderCurrenciesAndPrice(
        IERC20 tokenA, uint8 decimalsA,
        IERC20 tokenB, uint8 decimalsB,
        uint256 aPerUnitOfB,
        uint256 amountA,
        uint256 amountB
    )
        internal
        pure
        returns (
            Currency currency0,
            Currency currency1,
            uint160 sqrtPriceX96,
            uint256 amount0,
            uint256 amount1
        )
    {
        if (address(tokenA) < address(tokenB)) {
            currency0 = Currency.wrap(address(tokenA));
            currency1 = Currency.wrap(address(tokenB));
            amount0 = amountA;
            amount1 = amountB;
            // price_raw = 10^(decB - decA) / aPerUnitOfB
            // priceQ96  = price_raw * 2^96
            if (decimalsB >= decimalsA) {
                uint256 factor = 10 ** uint256(decimalsB - decimalsA);
                sqrtPriceX96 = _sqrtPriceX96FromPriceQ96((factor * (uint256(1) << 96)) / aPerUnitOfB);
            } else {
                uint256 factor = 10 ** uint256(decimalsA - decimalsB);
                sqrtPriceX96 = _sqrtPriceX96FromPriceQ96((uint256(1) << 96) / (aPerUnitOfB * factor));
            }
        } else {
            currency0 = Currency.wrap(address(tokenB));
            currency1 = Currency.wrap(address(tokenA));
            amount0 = amountB;
            amount1 = amountA;
            // price_raw = aPerUnitOfB * 10^(decA - decB)
            // priceQ96  = price_raw * 2^96
            if (decimalsA >= decimalsB) {
                uint256 factor = 10 ** uint256(decimalsA - decimalsB);
                sqrtPriceX96 = _sqrtPriceX96FromPriceQ96(aPerUnitOfB * factor * (uint256(1) << 96));
            } else {
                uint256 factor = 10 ** uint256(decimalsB - decimalsA);
                sqrtPriceX96 = _sqrtPriceX96FromPriceQ96((aPerUnitOfB * (uint256(1) << 96)) / factor);
            }
        }
    }

    /// @dev sqrtPriceX96 from price (token1/token0). priceQ96 = price * 2^96. Returns sqrt(price) * 2^96 = sqrt(priceQ96) << 48.
    function _sqrtPriceX96FromPriceQ96(uint256 priceQ96) internal pure returns (uint160) {
        uint256 sqrtP = _sqrt(priceQ96);
        return uint160(sqrtP << 48);
    }

    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    function _truncateTickSpacing(int24 tick, int24 tickSpacing) internal pure returns (int24) {
        return (tick / tickSpacing) * tickSpacing;
    }

    struct MintLiquidityArgs {
        PoolKey poolKey;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint256 amount0Max;
        uint256 amount1Max;
        address recipient;
    }

    function _mintLiquidityParams(MintLiquidityArgs memory args)
        internal
        pure
        returns (bytes memory actions, bytes[] memory mintParams)
    {
        bytes memory hookData = new bytes(0);
        actions = abi.encodePacked(
            uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR), uint8(Actions.SWEEP), uint8(Actions.SWEEP)
        );
        mintParams = new bytes[](4);
        mintParams[0] = abi.encode(
            args.poolKey, args.tickLower, args.tickUpper, args.liquidity,
            args.amount0Max, args.amount1Max, args.recipient, hookData
        );
        mintParams[1] = abi.encode(args.poolKey.currency0, args.poolKey.currency1);
        mintParams[2] = abi.encode(args.poolKey.currency0, args.recipient);
        mintParams[3] = abi.encode(args.poolKey.currency1, args.recipient);
    }
}

/*
source .env && forge script DeployMockTokensAndPools \
  --rpc-url $BASE_RPC_URL \
  --broadcast \
  --private-key $PRIVATE_KEY
  */