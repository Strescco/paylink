// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice LOCAL TEST ONLY — a stand-in for the real tUSD8 token.
///         The real tUSD8 on Aevum testnet (chain 44005) is
///         0x456569838f1d43009A91ebA4263147Afd7233483 (6 decimals).
///         This mock is NEVER deployed to testnet as a substitute for it;
///         it exists only so the PayLink test suite can run locally.
///         Matches the real token's name, symbol and decimals.
contract MockTUSD8 is ERC20 {
    constructor() ERC20("tUSD8", "tUSD8") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
