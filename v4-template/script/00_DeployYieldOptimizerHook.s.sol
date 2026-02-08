// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";

import {BaseScript} from "./base/BaseScript.sol";

import {YieldOptimizerHook} from "../src/YieldOptimizerHook.sol";

/// @notice Mines the address and deploys the YieldOptimizerHook contract
contract DeployYieldOptimizerHookScript is BaseScript {
    function run() public {
        // Must match getHookPermissions() in YieldOptimizerHook.sol
        uint160 flags = uint160(
            Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
                | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.AFTER_ADD_LIQUIDITY_FLAG
        );

        bytes memory constructorArgs = abi.encode(poolManager);
        (address hookAddress, bytes32 salt) = HookMiner.find(
            CREATE2_FACTORY,
            flags,
            type(YieldOptimizerHook).creationCode,
            constructorArgs
        );

        vm.startBroadcast();
        YieldOptimizerHook hook = new YieldOptimizerHook{salt: salt}(poolManager);
        vm.stopBroadcast();

        require(address(hook) == hookAddress, "DeployYieldOptimizerHook: Hook Address Mismatch");
    }
}

/*
  From v4-template, with .env containing BASE_RPC_URL and PRIVATE_KEY:

  source .env && forge script script/00_DeployYieldOptimizerHook.s.sol \
    --rpc-url "$BASE_RPC_URL" \
    --broadcast \
    --private-key "$PRIVATE_KEY"

  (If you skip "source .env", $BASE_RPC_URL is empty and Forge may error about --fork-url.)
*/