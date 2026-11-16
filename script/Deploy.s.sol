// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PayLink} from "../contracts/PayLink.sol";

/// @notice Deploy PayLink to Aevum testnet (chain 44005).
/// @dev Usage:
///       source .env
///       forge script script/Deploy.s.sol --rpc-url $AEVUM_RPC_URL --broadcast --verify \
///         --verifier blockscout --verifier-url https://explorer-test.qday.info/api
///       The tUSD8 address comes from the TUSD8_ADDRESS env var.
///       Official tUSD8 on Aevum: 0x456569838f1d43009A91ebA4263147Afd7233483 (6 decimals).
contract Deploy is Script {
    function run() external returns (PayLink payLink) {
        address token = vm.envAddress("TUSD8_ADDRESS");
        require(token != address(0), "TUSD8_ADDRESS not set");

        vm.startBroadcast();
        payLink = new PayLink(token);
        vm.stopBroadcast();

        console.log("PayLink deployed at:", address(payLink));
        console.log("Token (tUSD8):", token);
        console.log("Chain ID:", block.chainid);
    }
}
