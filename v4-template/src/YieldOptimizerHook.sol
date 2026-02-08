// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager, SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {IERC20Minimal} from "@uniswap/v4-core/src/interfaces/external/IERC20Minimal.sol";
import {CurrencySettler} from "@openzeppelin/uniswap-hooks/src/utils/CurrencySettler.sol";

/// @title YieldOptimizerHook
/// @notice A Uniswap v4 hook that enables:
/// 1. Multi-token basket deposits (accept multiple tokens, convert to pool pair)
/// 2. Idle liquidity auto-investment into yield platforms
/// 3. Just-in-time liquidity recall for large trades
contract YieldOptimizerHook is BaseHook {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    // ============ ERRORS ============
    error InvalidBasket();
    error InsufficientBalance();
    error SwapFailed();
    error Unauthorized();

    // ============ STRUCTS ============
    /// @notice Represents a token in a multi-token basket
    struct BasketToken {
        Currency currency;
        uint256 amount;
    }

    /// @notice Tracks idle liquidity positions in external platforms
    struct IdlePosition {
        address platform; // e.g., Aave lending pool
        Currency currency;
        uint256 amount;
        uint256 timestamp;
    }

    // ============ STATE VARIABLES ============
    /// @notice Maps pool ID to idle positions
    mapping(PoolId => IdlePosition[]) public idlePositions;
    
    /// @notice Maps pool ID to volume threshold (below which liquidity is moved)
    mapping(PoolId => uint256) public volumeThresholds;
    
    /// @notice Maps pool ID to last volume check timestamp
    mapping(PoolId => uint256) public lastVolumeCheck;
    
    /// @notice Maps pool ID to total volume in last period
    mapping(PoolId => uint256) public poolVolume;
    
    /// @notice Minimum liquidity percentage to keep in pool (e.g., 30% = 3000)
    uint256 public constant MIN_LIQUIDITY_PERCENT = 3000; // 30%
    
    /// @notice Owner/admin address
    address public owner;
    
    /// @notice Backend service address (can invest/withdraw idle liquidity)
    address public backendService;
    
    /// @notice Maps user address to their investment allocation percentage (0-5000 = 0-50%)
    mapping(address => uint256) public userInvestmentAllocation;
    
    /// @notice Maps pool ID to total invested amount
    mapping(PoolId => uint256) public totalInvestedAmount;

    // ============ EVENTS ============
    event BasketDeposit(
        PoolId indexed poolId,
        address indexed user,
        BasketToken[] basket,
        uint256 amount0,
        uint256 amount1
    );
    
    event LiquidityMovedToYield(
        PoolId indexed poolId,
        address indexed platform,
        Currency currency,
        uint256 amount
    );
    
    event LiquidityRecalled(
        PoolId indexed poolId,
        address indexed platform,
        Currency currency,
        uint256 amount
    );

    // ============ MODIFIERS ============
    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }
    
    modifier onlyBackend() {
        if (msg.sender != backendService) revert Unauthorized();
        _;
    }

    // ============ CONSTRUCTOR ============
    constructor(IPoolManager _poolManager) BaseHook(_poolManager) {
        owner = msg.sender;
    }
    
    // ============ ADMIN FUNCTIONS ============
    
    /// @notice Set backend service address
    function setBackendService(address _backendService) external onlyOwner {
        backendService = _backendService;
    }
    
    /// @notice Set user's investment allocation (0-5000 = 0-50%)
    function setUserInvestmentAllocation(address user, uint256 allocation) external onlyOwner {
        if (allocation > 5000) revert InvalidBasket(); // Max 50%
        userInvestmentAllocation[user] = allocation;
    }

    // ============ HOOK PERMISSIONS ============
    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: true,
            afterAddLiquidity: true,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // ============ MULTI-TOKEN BASKET FUNCTIONS ============
    
    /// @notice Add liquidity using a basket of multiple tokens
    /// @dev This is the "top-notch feature" - accepts multiple tokens and converts them to pool pair
    /// @dev For MVP: Currently accepts tokens that are currency0 or currency1. Swap routing will be added.
    /// @param key The pool key
    /// @param basket Array of tokens and amounts to deposit (must be currency0 or currency1)
    /// @param params Liquidity modification parameters
    /// @param hookData Additional hook data
    function addLiquidityWithBasket(
        PoolKey calldata key,
        BasketToken[] calldata basket,
        ModifyLiquidityParams calldata params,
        bytes calldata hookData
    ) external payable returns (BalanceDelta, BalanceDelta) {
        if (basket.length == 0) revert InvalidBasket();
        
        PoolId poolId = key.toId();
        uint256 totalAmount0 = 0;
        uint256 totalAmount1 = 0;
        
        // Process each token in the basket
        for (uint256 i = 0; i < basket.length; i++) {
            Currency currency = basket[i].currency;
            uint256 amount = basket[i].amount;
            
            // Check user has sufficient balance
            if (currency.isAddressZero()) {
                // Native token - amount should be in msg.value
                // For simplicity, we'll use the amount from basket
                if (msg.value < amount) revert InsufficientBalance();
            } else {
                IERC20Minimal token = IERC20Minimal(Currency.unwrap(currency));
                if (token.balanceOf(msg.sender) < amount) revert InsufficientBalance();
                // Transfer token to this contract first
                token.transferFrom(msg.sender, address(this), amount);
            }
            
            // If token is already currency0 or currency1, add directly
            if (currency == key.currency0) {
                totalAmount0 += amount;
            } else if (currency == key.currency1) {
                totalAmount1 += amount;
            } else {
                // For MVP: Revert if token is not currency0 or currency1
                // TODO: Implement swap routing to convert to pool currencies
                revert SwapFailed();
            }
        }
        
        // Sync and settle currencies to PoolManager
        if (totalAmount0 > 0) {
            CurrencySettler.settle(key.currency0, poolManager, address(this), totalAmount0, false);
        }
        if (totalAmount1 > 0) {
            CurrencySettler.settle(key.currency1, poolManager, address(this), totalAmount1, false);
        }
        
        // Now add liquidity with the converted amounts
        BalanceDelta delta;
        BalanceDelta fees;
        (delta, fees) = poolManager.modifyLiquidity(key, params, hookData);
        
        emit BasketDeposit(poolId, msg.sender, basket, totalAmount0, totalAmount1);
        
        return (delta, fees);
    }
    
    // Note: Swap routing for non-pool tokens will be implemented in Phase 2
    // This will integrate with a router (e.g., Uniswap V4 Router) to find the best path
    // and swap basket tokens to the pool's currency pair

    // ============ IDLE LIQUIDITY OPTIMIZATION ============
    
    /// @notice Set volume threshold for a pool (below which liquidity is moved to yield)
    function setVolumeThreshold(PoolId poolId, uint256 threshold) external onlyOwner {
        volumeThresholds[poolId] = threshold;
    }
    
    // ============ BACKEND-CALLABLE INVESTMENT FUNCTIONS ============
    
    /// @notice Invest idle liquidity into external platform (called by backend service)
    /// @dev Backend calculates how much to invest and calls this
    function investIdleLiquidity(
        PoolKey calldata key,
        Currency currency,
        uint256 amount,
        address platform
    ) external onlyBackend {
        PoolId poolId = key.toId();
        
        // Transfer tokens to platform (would need platform-specific logic)
        // For now, we track the position
        idlePositions[poolId].push(IdlePosition({
            platform: platform,
            currency: currency,
            amount: amount,
            timestamp: block.timestamp
        }));
        
        totalInvestedAmount[poolId] += amount;
        
        emit LiquidityMovedToYield(poolId, platform, currency, amount);
    }
    
    /// @notice Withdraw invested liquidity back to pool (called by backend service)
    /// @dev Backend determines when to recall liquidity
    function withdrawInvestedLiquidity(
        PoolKey calldata key,
        uint256 positionIndex,
        uint256 amount
    ) external onlyBackend {
        PoolId poolId = key.toId();
        IdlePosition[] storage positions = idlePositions[poolId];
        
        require(positionIndex < positions.length, "Invalid position");
        IdlePosition storage position = positions[positionIndex];
        require(position.amount >= amount, "Insufficient invested amount");
        
        position.amount -= amount;
        totalInvestedAmount[poolId] -= amount;
        
        // If position is fully withdrawn, remove it
        if (position.amount == 0) {
            positions[positionIndex] = positions[positions.length - 1];
            positions.pop();
        }
        
        emit LiquidityRecalled(poolId, position.platform, position.currency, amount);
    }
    
    /// @notice Get total invested amount for a pool
    function getTotalInvested(PoolId poolId) external view returns (uint256) {
        return totalInvestedAmount[poolId];
    }
    
    /// @notice Get user's investment allocation percentage
    function getUserAllocation(address user) external view returns (uint256) {
        return userInvestmentAllocation[user];
    }

    // ============ HOOK IMPLEMENTATIONS ============
    
    /// @notice Called before adding liquidity
    function _beforeAddLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        bytes calldata hookData
    ) internal override returns (bytes4) {
        // Track volume/liquidity changes
        PoolId poolId = key.toId();
        // Update last check timestamp
        lastVolumeCheck[poolId] = block.timestamp;
        
        return BaseHook.beforeAddLiquidity.selector;
    }
    
    /// @notice Called after adding liquidity
    function _afterAddLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        BalanceDelta delta0,
        BalanceDelta delta1,
        bytes calldata hookData
    ) internal override returns (bytes4, BalanceDelta) {
        // After liquidity is added, check if we should optimize
        // (In production, this might be done asynchronously)
        return (BaseHook.afterAddLiquidity.selector, BalanceDelta.wrap(0));
    }
    
    /// @notice Called before a swap - this is where we recall liquidity if needed
    function _beforeSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata hookData
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        PoolId poolId = key.toId();
        
        // Check if this is a large swap that might need more liquidity
        uint256 swapAmount = uint256(params.amountSpecified < 0 ? -params.amountSpecified : params.amountSpecified);
        
        // If swap is large, recall liquidity from yield platforms
        if (swapAmount > _getLargeSwapThreshold(poolId)) {
            _recallLiquidityFromYield(key, swapAmount);
        }
        
        // Update volume tracking
        poolVolume[poolId] += swapAmount;
        lastVolumeCheck[poolId] = block.timestamp;
        
        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }
    
    /// @notice Called after a swap
    function _afterSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) internal override returns (bytes4, int128) {
        // Post-swap logic (e.g., update metrics)
        return (BaseHook.afterSwap.selector, 0);
    }
    
    /// @notice Recall liquidity from yield platforms for a large trade
    function _recallLiquidityFromYield(PoolKey calldata key, uint256 requiredAmount) internal {
        PoolId poolId = key.toId();
        IdlePosition[] storage positions = idlePositions[poolId];
        
        uint256 recalled = 0;
        for (uint256 i = 0; i < positions.length && recalled < requiredAmount; i++) {
            IdlePosition storage position = positions[i];
            
            // TODO: Actually withdraw from the platform (Aave, etc.)
            // For MVP, this is a placeholder
            
            uint256 toRecall = position.amount;
            if (recalled + toRecall > requiredAmount) {
                toRecall = requiredAmount - recalled;
            }
            
            // Update position
            position.amount -= toRecall;
            recalled += toRecall;
            
            emit LiquidityRecalled(poolId, position.platform, position.currency, toRecall);
        }
    }
    
    /// @notice Get the threshold for what constitutes a "large swap"
    function _getLargeSwapThreshold(PoolId poolId) internal view returns (uint256) {
        // Simple heuristic: 10% of pool's typical volume
        // In production, this would be more sophisticated
        return volumeThresholds[poolId] / 10;
    }

    // ============ UTILITY FUNCTIONS ============
    
    /// @notice Get idle positions for a pool
    function getIdlePositions(PoolId poolId) external view returns (IdlePosition[] memory) {
        return idlePositions[poolId];
    }
    
    /// @notice Get pool volume metrics
    function getPoolMetrics(PoolId poolId) external view returns (uint256 volume, uint256 threshold, uint256 lastCheck) {
        return (poolVolume[poolId], volumeThresholds[poolId], lastVolumeCheck[poolId]);
    }
}

