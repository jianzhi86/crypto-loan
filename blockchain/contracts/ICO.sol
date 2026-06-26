// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Sells RinggitToken (MYR) for ETH at a fixed price. The owner holds
///         the token supply and approves this contract; buyers pay ETH and
///         receive MYR via safeTransferFrom(owner -> buyer).
contract ICO is Pausable, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public token;
    uint256 public price;          // wei required per 1 whole token (1e18 units)
    uint256 public totalTokensSold;

    event TokensPurchased(address indexed buyer, uint256 weiPaid, uint256 tokenAmount);
    event PriceUpdated(uint256 oldPrice, uint256 newPrice);

    constructor(address _tokenAddress, uint256 _price) Ownable(msg.sender) {
        require(_tokenAddress != address(0), "Invalid token");
        require(_price > 0, "Invalid price");
        token = IERC20(_tokenAddress);
        price = _price;
    }

    /// @notice Buy MYR with ETH. tokens = msg.value * 1e18 / price.
    function buyToken() external payable whenNotPaused {
        require(msg.value > 0, "Send ETH to buy");
        uint256 numberOfToken = (msg.value * 1e18) / price;
        require(numberOfToken > 0, "Amount too small");

        token.safeTransferFrom(owner(), msg.sender, numberOfToken);
        totalTokensSold += numberOfToken;
        emit TokensPurchased(msg.sender, msg.value, numberOfToken);
    }

    /// @notice How many token units `weiAmount` buys (for UI previews).
    function tokensFor(uint256 weiAmount) external view returns (uint256) {
        return (weiAmount * 1e18) / price;
    }

    function setPrice(uint256 _price) external onlyOwner {
        require(_price > 0, "Invalid price");
        emit PriceUpdated(price, _price);
        price = _price;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /// @notice Withdraw collected ETH to the owner.
    ///         Uses `call` instead of `transfer` — `transfer`'s fixed 2300-gas
    ///         stipend reverts if the owner is ever a contract wallet with a
    ///         nontrivial receive function.
    function withdrawal() external onlyOwner nonReentrant {
        uint256 amount = address(this).balance;
        require(amount > 0, "Nothing to withdraw");
        (bool ok, ) = payable(owner()).call{value: amount}("");
        require(ok, "ETH transfer failed");
    }
}
