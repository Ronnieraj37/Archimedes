// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IUniswapV4Router04} from "hookmate/interfaces/router/IUniswapV4Router04.sol";

/// @title BasketSwapper
/// @notice Wraps N single-pool swaps into ONE on-chain transaction.
///         User approves this contract for each input token (max approval, one-time),
///         then calls basketSwap().  The contract pulls every input token, approves the
///         router once per unique token (max), and calls swapExactTokensForTokens for each sub-swap.
///         Output tokens are sent directly to the receiver by the router.
///
///         Optimizations: (1) Approve router type(uint256).max once per unique token instead of
///         per-leg. (2) Direct interface call to router instead of low-level call + abi.encode.
contract BasketSwapper {
    IUniswapV4Router04 public immutable router;

    struct PoolKeyInput {
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
        PoolKeyInput poolKey; // which pool to route through
    }

    constructor(address _router) {
        router = IUniswapV4Router04(payable(_router));
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

            // 1. Pull input token from caller (required: router pulls from msg.sender = this)
            token.transferFrom(msg.sender, address(this), inputs[i].amountIn);

            // 2. Approve router only when needed (once per unique token; max so no repeat)
            if (token.allowance(address(this), address(router)) < inputs[i].amountIn) {
                token.approve(address(router), type(uint256).max);
            }

            // 3. Build v4 PoolKey and execute swap — output goes directly to receiver
            PoolKey memory pk = PoolKey({
                currency0: Currency.wrap(inputs[i].poolKey.currency0),
                currency1: Currency.wrap(inputs[i].poolKey.currency1),
                fee: inputs[i].poolKey.fee,
                tickSpacing: inputs[i].poolKey.tickSpacing,
                hooks: IHooks(inputs[i].poolKey.hooks)
            });

            router.swapExactTokensForTokens(
                inputs[i].amountIn,
                inputs[i].amountOutMin,
                inputs[i].zeroForOne,
                pk,
                "", // hookData
                receiver,
                deadline
            );
        }
    }
}
