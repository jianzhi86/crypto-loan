// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MockMYR.sol";

/// @notice ETH-collateral MYR loan contract for Hardhat local testing
contract CryptoLoan {
    MockMYR public myr;

    uint256 public ethPrice;                    // MYR per ETH, whole number (e.g. 18000)
    uint256 public constant MAX_LTV        = 70; // 70%
    uint256 public constant LIQ_THRESHOLD  = 80; // 80%
    uint256 public constant BORROW_APR_BPS = 480; // 4.8% APR

    address public owner;

    mapping(address => bool) public kycApproved;

    struct Loan {
        uint256 collateral;  // wei
        uint256 borrowed;    // MYR units (6 decimals), principal only
        uint256 startTime;   // unix timestamp of first borrow
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
        myr       = new MockMYR();
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ── KYC ────────────────────────────────────────────────────────────────

    /// @notice Owner sets KYC status (called by backend after off-chain admin review)
    function setKYC(address user, bool approved) external onlyOwner {
        kycApproved[user] = approved;
        if (approved) emit KYCApproved(user);
    }

    // ── Admin ──────────────────────────────────────────────────────────────

    /// @notice Update on-chain ETH price in MYR (owner only, called by sync-price API)
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

        uint256 maxBorrow = (loan.collateral * ethPrice * MAX_LTV * 1e6) / (1e18 * 100);
        require(loan.borrowed + myrAmount <= maxBorrow, "Exceeds max LTV");

        if (loan.startTime == 0) loan.startTime = block.timestamp;
        loan.borrowed += myrAmount;

        myr.mint(msg.sender, myrAmount);
        emit Borrowed(msg.sender, myrAmount);
    }

    /// @notice Repay MYR debt. Interest is paid first, then principal is reduced.
    ///         Approve at least totalDue(msg.sender) before calling.
    function repay(uint256 myrAmount) external {
        Loan storage loan = loans[msg.sender];
        require(loan.borrowed > 0, "No active loan");

        uint256 interest = accruedInterest(msg.sender);
        uint256 due      = loan.borrowed + interest;
        uint256 paying   = myrAmount > due ? due : myrAmount;

        // Transfer MYR from user (interest stays in contract as protocol revenue)
        myr.transferFrom(msg.sender, address(this), paying);

        // Pay interest first; any remainder reduces principal
        uint256 principalPaid = paying > interest ? paying - interest : 0;

        if (principalPaid >= loan.borrowed) {
            loan.borrowed  = 0;
            loan.startTime = 0;
        } else {
            loan.borrowed -= principalPaid;
        }

        emit Repaid(msg.sender, paying);
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

    /// @notice Accrued interest for a user (MYR units, 6 decimals)
    ///         interest = principal * APR_BPS * elapsed / (10000 * 365 days)
    function accruedInterest(address user) public view returns (uint256) {
        Loan storage loan = loans[user];
        if (loan.borrowed == 0 || loan.startTime == 0) return 0;
        uint256 elapsed = block.timestamp - loan.startTime;
        return (loan.borrowed * BORROW_APR_BPS * elapsed) / (10000 * 365 days);
    }

    /// @notice Total amount currently owed (principal + accrued interest)
    function totalDue(address user) public view returns (uint256) {
        return loans[user].borrowed + accruedInterest(user);
    }

    /// @notice Health factor scaled by 1e18. Returns max uint256 when no debt.
    function healthFactor(address user) public view returns (uint256) {
        Loan storage loan = loans[user];
        if (loan.borrowed == 0) return type(uint256).max;
        return (loan.collateral * ethPrice * LIQ_THRESHOLD * 1e6) / (100 * loan.borrowed);
    }

    /// @notice Additional MYR available to borrow (6 decimals)
    function availableToBorrow(address user) public view returns (uint256) {
        Loan storage loan = loans[user];
        uint256 maxBorrow = (loan.collateral * ethPrice * MAX_LTV * 1e6) / (1e18 * 100);
        return maxBorrow > loan.borrowed ? maxBorrow - loan.borrowed : 0;
    }

    /// @notice Returns collateral (wei), borrowed (MYR units), hf (1e18-scaled),
    ///         available MYR, collateral value (whole MYR), accrued interest (MYR units)
    function getLoanInfo(address user)
        external
        view
        returns (
            uint256 collateral,
            uint256 borrowed,
            uint256 hf,
            uint256 available,
            uint256 collateralValueMYR,
            uint256 interest
        )
    {
        Loan storage loan = loans[user];
        return (
            loan.collateral,
            loan.borrowed,
            healthFactor(user),
            availableToBorrow(user),
            (loan.collateral * ethPrice) / 1e18,
            accruedInterest(user)
        );
    }
}
