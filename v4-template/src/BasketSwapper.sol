// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "forge-std/interfaces/IERC20.sol";

/// @title BasketSwapper
/// @notice Wraps N single-pool swaps into ONE on-chain transaction.
///         User approves this contract for each input token (max approval, one-time),
///         then calls basketSwap().  The contract pulls every input token, approves the
///         Hookmate V4 Swap Router, and calls swapExactTokensForTokens for each sub-swap.
///         Output tokens are sent directly to the receiver by the router.
///
///         Because all sub-swaps run inside one transaction the YieldOptimizerHook's
///         beforeSwap / afterSwap fire for each leg — same block, same tx.
contract BasketSwapper {
    address public immutable router;

    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    struct SwapInput {
        address token;        // input ERC-20 address
        uint256 amountIn;     // raw amount (with decimals)
        uint256 amountOutMin; // minimum output (slippage protection)
        bool zeroForOne;      // swap direction in the pool
        PoolKey poolKey;      // which pool to route through
    }

    constructor(address _router) {
        router = _router;
    }

    /// @notice Execute N input-token → output-token swaps in a single tx.
    /// @param inputs   Array of swap parameters (one per input token).
    /// @param receiver Address that receives ALL output tokens.
    /// @param deadline Unix timestamp after which the tx reverts.
    function basketSwap(
        SwapInput[] calldata inputs,
        address receiver,
        uint256 deadline
    ) external {
        for (uint256 i = 0; i < inputs.length; i++) {
            IERC20 token = IERC20(inputs[i].token);

            // 1. Pull input token from caller
            token.transferFrom(msg.sender, address(this), inputs[i].amountIn);

            // 2. Approve router to spend it
            token.approve(router, inputs[i].amountIn);

            // 3. Execute the swap — output goes directly to receiver
            //    The Hookmate router uses direct transferFrom(msg.sender=this, poolManager, amountIn).
            //    Because we approved the router in step 2, this works.
            (bool ok, bytes memory result) = router.call(
                abi.encodeWithSignature(
                    "swapExactTokensForTokens(uint256,uint256,bool,(address,address,uint24,int24,address),bytes,address,uint256)",
                    inputs[i].amountIn,
                    inputs[i].amountOutMin,
                    inputs[i].zeroForOne,
                    inputs[i].poolKey,
                    "",
                    receiver,
                    deadline
                )
            );

            if (!ok) {
                // Bubble up the revert reason from the router
                assembly {
                    revert(add(result, 32), mload(result))
                }
            }
        }
    }
}
