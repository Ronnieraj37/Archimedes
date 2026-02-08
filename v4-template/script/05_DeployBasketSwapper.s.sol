// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {BasketSwapper} from "../src/BasketSwapper.sol";

/**
 * Deploys BasketSwapper on Base Sepolia.
 *
 * Prerequisites:
 *   - Hookmate V4 Swap Router is already deployed (AddressConstants).
 *
 * Run on Base Sepolia:
 *   forge script script/05_DeployBasketSwapper.s.sol:DeployBasketSwapper \
 *     --rpc-url https://sepolia.base.org --broadcast
 *
 * After deployment, copy the logged address into:
 *   my-app/lib/constants/swap.ts → BASKET_SWAPPER_ADDRESS
 */
contract DeployBasketSwapper is Script {
    /// Hookmate V4 Swap Router on Base Sepolia
    address constant ROUTER = 0x71cD4Ea054F9Cb3D3BF6251A00673303411A7DD9;

    function run() external {
        require(block.chainid == 84532, "Run on Base Sepolia only");

        vm.startBroadcast();

        BasketSwapper swapper = new BasketSwapper(ROUTER);

        console2.log("BasketSwapper deployed at:", address(swapper));

        vm.stopBroadcast();
    }
}

/*
source .env && forge script DeployBasketSwapper \
  --rpc-url $BASE_RPC_URL \
  --broadcast \
  --private-key $PRIVATE_KEY
  */