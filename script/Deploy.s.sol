// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PayLink} from "../contracts/PayLink.sol";
import {AgentRegistry} from "../contracts/AgentRegistry.sol";

/// @notice Deploy PayLink v2 + AgentRegistry to Aevum testnet (chain 44005).
/// @dev Usage:
///       forge script script/Deploy.s.sol --rpc-url https://rpc-test.qday.info \
///         --private-key $PRIVATE_KEY --broadcast
///       The tUSD8 address comes from the TUSD8_ADDRESS env var.
///       Official tUSD8 on Aevum: 0x456569838f1d43009A91ebA4263147Afd7233483 (6 decimals).
///       Steps: 1) deploy AgentRegistry, 2) deploy PayLink(token, registry, deployer),
///       3) authorize the PayLink in the registry so settlements grow reputation.
///       The deployer (wallet A) is the fee recipient (0.5% on settle).
contract Deploy is Script {
    function run() external returns (AgentRegistry registry, PayLink payLink) {
        address token = vm.envAddress("TUSD8_ADDRESS");
        require(token != address(0), "TUSD8_ADDRESS not set");

        vm.startBroadcast();

        registry = new AgentRegistry();
        console.log("AgentRegistry deployed at:", address(registry));

        payLink = new PayLink(token, address(registry), msg.sender);
        console.log("PayLink v2 deployed at:", address(payLink));

        registry.authorizePayLink(address(payLink), true);
        console.log("PayLink authorized in registry: true");

        vm.stopBroadcast();

        console.log("Token (tUSD8):", token);
        console.log("Fee recipient (deployer):", msg.sender);
        console.log("Fee (bps):", payLink.FEE_BPS());
        console.log("Chain ID:", block.chainid);
    }
}
