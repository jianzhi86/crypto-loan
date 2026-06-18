// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Standalone Ringgit Malaysia (MYR) ERC-20 sold via the ICO contract.
///         Mirrors the classic ICO-tutorial token: full supply minted to the
///         deployer, who approves the ICO to sell it. Separate from the loan
///         system's internal MockMYR.
contract RinggitToken is ERC20, Ownable {
    constructor() ERC20("Ringgit Malaysia (ICO)", "MYRC") Ownable(msg.sender) {
        _mint(msg.sender, 100_000 * 10 ** decimals());
    }
}
