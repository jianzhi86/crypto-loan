// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MockMYR.sol";

/// @notice ETH-collateral MYR loan contract for Hardhat local testing
contract CryptoLoan {
    MockMYR public myr;

    uint256 public ethPrice;                    // MYR per ETH, whole number (e.g. 18000)
    uint256 public constant MAX_LTV        = 70; // 70%
    uint256 public constant LIQ_THRESHOLD  = 80; // 80%
    uint256 public constant BORROW_APR_BPS = 480; // 4.8%

    address public owner;

    mapping(address => bool) public kycApproved;

    struct Loan {
        uint256 collateral;  // wei
        uint256 borrowed;    // MYR units (6 decimals)
        uint256 startTime;
    }

    mapping(address => Loan) public loans;

    event CollateralDeposited(address indexed user, uint256 amount);
    event Borrowed(address indexed user, uint256 myrAmount);
    event Repaid(address indexed user, uint256 myrAmount);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event PriceUpdated(uint256 newPrice);
    event KYCApproved(address indexed user);

    constructor(uint256 _ethPrice) {
        owner     = msg.sender;
        ethPrice  = _ethPrice;
        myr       = new MockMYR(); // MockMYR.minter == address(this)
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ── KYC ────────────────────────────────────────────────────────────────

    /// @notice Auto-approves KYC for Hardhat testnet — real deployment would require off-chain oracle
    function submitKYC() external {
        kycApproved[msg.sender] = true;
        emit KYCApproved(msg.sender);
    }

    function setKYC(address user, bool approved) external onlyOwner {
        kycApproved[user] = approved;
        if (approved) emit KYCApproved(user);
    }

    // ── Admin ──────────────────────────────────────────────────────────────

    /// @notice Update on-chain ETH price in MYR (owner only)
    function setEthPrice(uint256 _price) external onlyOwner {
        require(_price > 0, "Invalid price");
        ethPrice = _price;
        emit PriceUpdated(_price);
    }

    // ── Core ───────────────────────────────────────────────────────────────

    function depositCollateral() external payable {
        require(msg.value > 0, "Send ETH");
        loans[msg.sender].collateral += msg.value;
        emit CollateralDeposited(msg.sender, msg.value);
    }

    function borrow(uint256 myrAmount) external {
        Loan storage loan = loans[msg.sender];
        require(kycApproved[msg.sender], "KYC verification required");
        require(loan.collateral > 0, "Deposit collateral first");
        require(myrAmount > 0, "Amount must be > 0");

        // maxBorrow (MYR units, 6 dec) = collateral(wei) * ethPrice(MYR) * MAX_LTV% / (1e18 * 100)
        // Rearranged to avoid overflow: multiply 1e6 last
        uint256 maxBorrow = (loan.collateral * ethPrice * MAX_LTV * 1e6) / (1e18 * 100);
        require(loan.borrowed + myrAmount <= maxBorrow, "Exceeds max LTV");

        if (loan.startTime == 0) loan.startTime = block.timestamp;
        loan.borrowed += myrAmount;

        myr.mint(msg.sender, myrAmount);
        emit Borrowed(msg.sender, myrAmount);
    }

    function repay(uint256 myrAmount) external {
        Loan storage loan = loans[msg.sender];
        require(loan.borrowed > 0, "No active loan");

        uint256 amount = myrAmount > loan.borrowed ? loan.borrowed : myrAmount;
        myr.transferFrom(msg.sender, address(this), amount);
        loan.borrowed -= amount;
        if (loan.borrowed == 0) loan.startTime = 0;

        emit Repaid(msg.sender, amount);
    }

    function withdrawCollateral(uint256 weiAmount) external {
        Loan storage loan = loans[msg.sender];
        require(loan.collateral >= weiAmount, "Not enough collateral");

        uint256 remaining = loan.collateral - weiAmount;
        if (loan.borrowed > 0) {
            uint256 maxBorrow = (remaining * ethPrice * MAX_LTV * 1e6) / (1e18 * 100);
            require(loan.borrowed <= maxBorrow, "Would violate LTV");
        }

        loan.collateral -= weiAmount;
        payable(msg.sender).transfer(weiAmount);
        emit CollateralWithdrawn(msg.sender, weiAmount);
    }

    // ── Views ───────────────────────────────────────────────────────────────

    /// Returns HF scaled by 1e18. Returns max uint256 when no debt.
    function healthFactor(address user) public view returns (uint256) {
        Loan storage loan = loans[user];
        if (loan.borrowed == 0) return type(uint256).max;
        // HF * 1e18 = collateral(wei) * ethPrice(MYR) * LIQ_THRESHOLD * 1e6 / (100 * borrowed)
        // collateral(wei) * ethPrice / 1e18 = collateral value in MYR
        // already 1e18-scaled because wei cancels with /1e18 and we multiply by 1e18 at end
        return (loan.collateral * ethPrice * LIQ_THRESHOLD * 1e6) / (100 * loan.borrowed);
    }

    /// Returns additional MYR available to borrow (6 decimals)
    function availableToBorrow(address user) public view returns (uint256) {
        Loan storage loan = loans[user];
        uint256 maxBorrow = (loan.collateral * ethPrice * MAX_LTV * 1e6) / (1e18 * 100);
        return maxBorrow > loan.borrowed ? maxBorrow - loan.borrowed : 0;
    }

    /// Returns collateral (wei), borrowed (MYR units), hf (1e18-scaled), available MYR, collateral value (whole MYR)
    function getLoanInfo(address user)
        external
        view
        returns (
            uint256 collateral,
            uint256 borrowed,
            uint256 hf,
            uint256 available,
            uint256 collateralValueMYR
        )
    {
        Loan storage loan = loans[user];
        return (
            loan.collateral,
            loan.borrowed,
            healthFactor(user),
            availableToBorrow(user),
            (loan.collateral * ethPrice) / 1e18
        );
    }
}
