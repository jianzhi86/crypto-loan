// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Mock Malaysian Ringgit token minted by CryptoLoan on borrow
contract MockMYR is ERC20 {
    address public minter;

    constructor() ERC20("Mock Malaysian Ringgit", "MYR") {
        minter = msg.sender; // will be CryptoLoan contract address
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "Not authorized");
        _mint(to, amount);
    }
}
