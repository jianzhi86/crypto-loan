// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./MockMYR.sol";

/// @notice ETH-collateral MYR lending protocol — Nexo-style
contract CryptoLoan is ReentrancyGuard, Pausable, Ownable2Step {
    MockMYR public myr;

    // ── Constants ──────────────────────────────────────────────────────────
    uint256 public constant MAX_LTV          = 70;   // 70% max loan-to-value
    uint256 public constant LIQ_THRESHOLD    = 80;   // 80% liquidation trigger
    uint256 public constant LIQ_BONUS        = 5;    // 5% bonus for liquidators
    uint256 public constant MIN_HEALTH       = 1e18; // HF below this = liquidatable
    uint256 public constant PRECISION        = 1e18;
    uint256 public constant MYR_DECIMALS     = 1e6;
    uint256 public constant MAX_PRICE_CHANGE = 20;   // max 20% price move per update

    // Variable borrow rate, bank-style: a base rate plus premiums that move
    // with market conditions. APR = BASE + utilization premium + volatility
    // premium — see currentAprBps().
    uint256 public baseRateBps           = 300;  // owner-adjustable market rate (initial 3.0%)
    uint256 public constant UTIL_SLOPE_BPS   = 400;  // up to +4.0% as lending capacity fills
    uint256 public constant VOL_SLOPE_BPS    = 300;  // up to +3.0% on a max (20%) ETH/MYR move
    uint256 public constant MAX_BASE_RATE_BPS = 1500; // hard cap: 15%

    /// @notice Ceiling on protocol-wide outstanding debt, in MYR units.
    ///         MYR is minted on demand, so this is what makes "the pool" a real
    ///         quantity: it is the denominator of utilizationBps(), which drives
    ///         the borrow-rate premium, and the thing borrow() refuses to exceed.
    ///         Owner-settable, so it cannot be `constant` or `immutable`.
    uint256 public supplyCap = 100_000_000 * MYR_DECIMALS;   // RM 100,000,000

    /// @notice Interest ticks once per minute rather than once per second, so the
    ///         figure the UI quotes on its 60s refresh is exactly the figure the
    ///         contract charges — not a per-second value that has already moved
    ///         by the time the user signs the transaction.
    uint256 public constant ACCRUAL_STEP = 60;

    // ── State ──────────────────────────────────────────────────────────────
    uint256 public ethPrice;       // MYR per ETH (whole number, e.g. 18000)
    uint256 public prevEthPrice;   // price before the last update (volatility input)
    uint256 public lastPriceTime;  // last price update timestamp
    uint256 public protocolFees;   // accumulated interest revenue (MYR units)
    uint256 public totalBorrowed;  // protocol-wide outstanding debt (MYR units)
    uint256 public totalCollateral;// protocol-wide collateral (wei)

    mapping(address => bool)   public kycApproved;
    mapping(address => Loan)   public loans;
    mapping(address => bool)   public liquidators; // whitelisted liquidators
    mapping(address => uint256) public supplyStart; // timestamp supply accrual started per depositor

    struct Loan {
        uint256 collateral;   // wei
        uint256 principal;    // MYR units (6 decimals), original borrowed amount
        uint256 startTime;    // unix timestamp of first borrow
        uint256 lastRepayTime;// unix timestamp of last repayment (for interest reset)
    }

    // ── Events ─────────────────────────────────────────────────────────────
    event CollateralDeposited(address indexed user, uint256 amount);
    event Borrowed(address indexed user, uint256 myrAmount, uint256 newTotal);
    event Repaid(address indexed user, uint256 principal, uint256 interest);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event Liquidated(address indexed user, address indexed liquidator, uint256 debtCovered, uint256 collateralSeized);
    event PriceUpdated(uint256 oldPrice, uint256 newPrice, address updatedBy);
    event BaseRateUpdated(uint256 oldRateBps, uint256 newRateBps);
    event SupplyCapUpdated(uint256 oldCap, uint256 newCap);
    event KYCSet(address indexed user, bool approved);
    event LiquidatorSet(address indexed liquidator, bool approved);
    event ProtocolFeesWithdrawn(address indexed to, uint256 amount);
    event EmergencyWithdraw(address indexed to, uint256 amount);
    event MYRPurchased(address indexed buyer, uint256 ethSpent, uint256 myrReceived);
    event SupplyInterestClaimed(address indexed user, uint256 amount);

    // ── Constructor ────────────────────────────────────────────────────────
    constructor(uint256 _ethPrice) Ownable(msg.sender) {
        require(_ethPrice > 0, "Invalid price");
        ethPrice     = _ethPrice;
        lastPriceTime = block.timestamp;
        myr          = new MockMYR();
    }

    // ── Modifiers ──────────────────────────────────────────────────────────
    modifier onlyKYC() {
        require(kycApproved[msg.sender], "KYC required");
        _;
    }

    modifier onlyLiquidator() {
        require(liquidators[msg.sender] || msg.sender == owner(), "Not liquidator");
        _;
    }

    // ── Admin ──────────────────────────────────────────────────────────────

    function setKYC(address user, bool approved) external onlyOwner {
        require(user != address(0), "Zero address");
        kycApproved[user] = approved;
        emit KYCSet(user, approved);
    }

    function setLiquidator(address liquidator, bool approved) external onlyOwner {
        require(liquidator != address(0), "Zero address");
        liquidators[liquidator] = approved;
        emit LiquidatorSet(liquidator, approved);
    }

    /// @notice Update ETH price with sanity check (max 20% move per update)
    function setEthPrice(uint256 _price) external onlyOwner {
        require(_price > 0, "Invalid price");
        uint256 old = ethPrice;
        if (old > 0) {
            uint256 diff = _price > old ? _price - old : old - _price;
            require(diff * 100 / old <= MAX_PRICE_CHANGE, "Price move too large");
        }
        prevEthPrice  = old;
        ethPrice      = _price;
        lastPriceTime = block.timestamp;
        emit PriceUpdated(old, _price, msg.sender);
    }

    /// @notice Adjust the market-driven base borrow rate (owner only, capped at 15%)
    function setBaseRate(uint256 rateBps) external onlyOwner {
        require(rateBps <= MAX_BASE_RATE_BPS, "Rate exceeds cap");
        uint256 old = baseRateBps;
        baseRateBps = rateBps;
        emit BaseRateUpdated(old, rateBps);
    }

    /// @notice Resize the lending pool (owner only).
    /// @dev Never below what is already lent out. A cap under the outstanding
    ///      debt would push utilizationBps() to 100%, instantly pinning every
    ///      borrower at MAX_BASE_RATE_BPS with no way to repay out of it.
    function setSupplyCap(uint256 newCap) external onlyOwner {
        require(newCap >= totalBorrowed, "Cap below outstanding debt");
        uint256 old = supplyCap;
        supplyCap = newCap;
        emit SupplyCapUpdated(old, newCap);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /// @notice Withdraw accumulated protocol fee revenue
    function withdrawProtocolFees(address to) external onlyOwner nonReentrant {
        require(to != address(0), "Zero address");
        uint256 amount = protocolFees;
        require(amount > 0, "No fees");
        protocolFees = 0;
        myr.transfer(to, amount);
        emit ProtocolFeesWithdrawn(to, amount);
    }

    // ── Core ───────────────────────────────────────────────────────────────

    /// @notice Swap ETH for MYR tokens at the current on-chain price.
    ///         Lets borrowers top-up MYR to repay their loans.
    function buyMYR(uint256 myrAmount) external payable whenNotPaused nonReentrant {
        require(myrAmount > 0, "Amount must be > 0");
        require(ethPrice > 0, "Price not set");
        // ETH needed = (myrAmount / ethPrice) in wei.
        // myrAmount is in MYR_DECIMALS (1e6) units; ethPrice is whole MYR per ETH.
        uint256 ethNeeded = (myrAmount * 1e18) / (ethPrice * MYR_DECIMALS);
        require(msg.value >= ethNeeded, "Insufficient ETH");
        myr.mint(msg.sender, myrAmount);
        // Refund any excess ETH sent
        uint256 excess = msg.value - ethNeeded;
        if (excess > 0) {
            payable(msg.sender).transfer(excess);
        }
        emit MYRPurchased(msg.sender, ethNeeded, myrAmount);
    }

    function depositCollateral() external payable whenNotPaused nonReentrant {
        require(msg.value > 0, "Send ETH");
        if (supplyStart[msg.sender] == 0) {
            supplyStart[msg.sender] = block.timestamp;
        }
        loans[msg.sender].collateral += msg.value;
        totalCollateral              += msg.value;
        emit CollateralDeposited(msg.sender, msg.value);
    }

    function borrow(uint256 myrAmount) external whenNotPaused nonReentrant onlyKYC {
        require(myrAmount > 0, "Amount must be > 0");
        Loan storage loan = loans[msg.sender];
        require(loan.collateral > 0, "Deposit collateral first");

        uint256 maxBorrow = _maxBorrow(loan.collateral);
        require(loan.principal + myrAmount <= maxBorrow, "Exceeds max LTV");
        // Checked after the per-user LTV limit so the more common, more
        // actionable message is the one a borrower normally sees.
        require(totalBorrowed + myrAmount <= supplyCap, "Pool cap reached");

        if (loan.startTime == 0) {
            loan.startTime    = block.timestamp;
            loan.lastRepayTime = block.timestamp;
        }
        loan.principal += myrAmount;
        totalBorrowed  += myrAmount;

        myr.mint(msg.sender, myrAmount);
        emit Borrowed(msg.sender, myrAmount, loan.principal);
    }

    /// @notice Repay MYR. Interest paid first, then principal.
    ///         Caller must approve this contract for at least `myrAmount`.
    ///         Collateral is NOT auto-returned on a full repay — it stays
    ///         deposited (loan.collateral untouched) so the same collateral
    ///         can back a new borrow without redepositing. Withdraw it
    ///         explicitly via withdrawCollateral() whenever you want it back.
    function repay(uint256 myrAmount) external whenNotPaused nonReentrant {
        Loan storage loan = loans[msg.sender];
        require(loan.principal > 0, "No active loan");
        require(myrAmount > 0, "Amount must be > 0");

        uint256 interest = accruedInterest(msg.sender);
        uint256 due      = loan.principal + interest;
        uint256 paying   = myrAmount > due ? due : myrAmount;

        myr.transferFrom(msg.sender, address(this), paying);

        uint256 interestPaid   = paying >= interest ? interest : paying;
        uint256 principalPaid  = paying > interest ? paying - interest : 0;

        protocolFees   += interestPaid;
        totalBorrowed  -= principalPaid;

        if (principalPaid >= loan.principal) {
            loan.principal     = 0;
            loan.startTime     = 0;
            loan.lastRepayTime = 0;
        } else {
            loan.principal    -= principalPaid;
            loan.lastRepayTime = block.timestamp;
        }

        emit Repaid(msg.sender, principalPaid, interestPaid);
    }

    function withdrawCollateral(uint256 weiAmount) external whenNotPaused nonReentrant {
        Loan storage loan = loans[msg.sender];
        require(loan.collateral >= weiAmount, "Not enough collateral");

        uint256 remaining = loan.collateral - weiAmount;
        if (loan.principal > 0) {
            uint256 maxBorrow = _maxBorrow(remaining);
            require(loan.principal <= maxBorrow, "Would violate LTV");
        }

        // A full withdrawal ends supply accrual (supplyStart resets below).
        // accruedSupplyInterest() returns 0 once collateral is 0, so anything
        // accrued but not yet claimed must be paid out NOW, before that
        // happens — otherwise it's forfeited with no way to claim it after.
        // Computed while loan.collateral still holds its pre-withdrawal
        // value, same as claimSupplyInterest()'s own payout.
        uint256 payout = remaining == 0 ? accruedSupplyInterest(msg.sender) : 0;

        loan.collateral  -= weiAmount;
        totalCollateral  -= weiAmount;
        if (loan.collateral == 0) {
            supplyStart[msg.sender] = 0;
        }

        if (payout > 0) {
            myr.mint(msg.sender, payout);
            emit SupplyInterestClaimed(msg.sender, payout);
        }

        (bool ok, ) = payable(msg.sender).call{value: weiAmount}("");
        require(ok, "ETH transfer failed");
        emit CollateralWithdrawn(msg.sender, weiAmount);
    }

    /// @notice Liquidate an undercollateralised position.
    ///         Liquidator repays `debtAmount` MYR and receives collateral + LIQ_BONUS.
    function liquidate(address borrower, uint256 debtAmount)
        external
        whenNotPaused
        nonReentrant
        onlyLiquidator
    {
        require(borrower != address(0), "Zero address");
        require(debtAmount > 0, "Amount must be > 0");
        require(_healthFactor(borrower) < MIN_HEALTH, "Not liquidatable");

        Loan storage loan = loans[borrower];
        uint256 interest  = accruedInterest(borrower);
        uint256 totalDebt = loan.principal + interest;
        uint256 covering  = debtAmount > totalDebt ? totalDebt : debtAmount;

        // Collateral to seize = debt value in ETH (wei) + liquidation bonus
        // covering is MYR (6 dec), ethPrice is MYR/ETH whole number
        // collateralWei = covering * 1e18 / (ethPrice * 1e6)
        uint256 collateralValue = (covering * PRECISION) / (ethPrice * MYR_DECIMALS);
        uint256 bonus           = (collateralValue * LIQ_BONUS) / 100;
        uint256 seize           = collateralValue + bonus;
        if (seize > loan.collateral) {
            // Not enough collateral left to fully cover `covering` + bonus —
            // scale the MYR pulled from the liquidator down to match what's
            // actually seizable, so they're never charged for collateral they
            // don't receive.
            seize = loan.collateral;
            collateralValue = (seize * 100) / (100 + LIQ_BONUS);
            covering        = (collateralValue * ethPrice * MYR_DECIMALS) / PRECISION;
        }

        // Pull MYR from liquidator
        myr.transferFrom(msg.sender, address(this), covering);

        uint256 interestCovered  = covering >= interest ? interest : covering;
        uint256 principalCovered = covering > interest ? covering - interest : 0;

        protocolFees  += interestCovered;
        totalBorrowed -= principalCovered;

        loan.principal   -= principalCovered;
        loan.collateral  -= seize;
        totalCollateral  -= seize;

        if (loan.principal == 0) {
            loan.startTime     = 0;
            loan.lastRepayTime = 0;
        }

        (bool ok, ) = payable(msg.sender).call{value: seize}("");
        require(ok, "ETH transfer failed");

        emit Liquidated(borrower, msg.sender, covering, seize);
    }

    // ── Views ───────────────────────────────────────────────────────────────

    /// @notice Share of the pool currently lent out, in basis points (0–10,000).
    function utilizationBps() public view returns (uint256) {
        if (supplyCap == 0) return 10_000;            // a zero pool is fully used
        uint256 u = (totalBorrowed * 10_000) / supplyCap;
        return u > 10_000 ? 10_000 : u;               // clamp: the cap can be lowered
    }

    /// @notice MYR still lendable before the pool cap is reached.
    function availableToBorrowPool() public view returns (uint256) {
        return supplyCap > totalBorrowed ? supplyCap - totalBorrowed : 0;
    }

    /// @notice The utilization premium alone, in bps — what currentAprBps() adds
    ///         on top of baseRateBps before the MAX_BASE_RATE_BPS clamp. Exposed
    ///         so the UI can show the premium as its own line without
    ///         re-implementing a formula that would then be free to drift.
    function utilPremiumBps() public view returns (uint256) {
        return (UTIL_SLOPE_BPS * utilizationBps()) / 10_000;
    }

    /// @notice The live borrow APR in basis points: the admin-controlled base
    ///         rate (tracked against the market by the price keeper) plus a
    ///         utilization premium of up to UTIL_SLOPE_BPS as the pool fills,
    ///         hard-capped at MAX_BASE_RATE_BPS.
    ///
    ///         This is THE rate. Every borrower-facing figure in the web app —
    ///         the Borrow tab's projections, the Repay tab's ledger interest,
    ///         the full-payoff quote — is derived from this call and never from
    ///         baseRateBps, which may only ever be *labelled* "base rate". An
    ///         earlier revision applied the slope here while the UI still quoted
    ///         baseRateBps; that mismatch is what produced repay discrepancies,
    ///         and the fix is one shared source, not a flat rate.
    ///
    ///         VOL_SLOPE_BPS stays defined but unapplied: it would move the rate
    ///         on a price update, which a borrower can neither observe before it
    ///         happens nor mirror from a single view call.
    function currentAprBps() public view returns (uint256) {
        uint256 rate = baseRateBps + utilPremiumBps();
        return rate > MAX_BASE_RATE_BPS ? MAX_BASE_RATE_BPS : rate;
    }

    /// @dev Interest accrues at the CURRENT rate over the whole elapsed period
    ///      — a demo-grade simplification (production protocols index each
    ///      rate change). The rate only moves with utilization and price
    ///      updates, so the error window is small.
    function accruedInterest(address user) public view returns (uint256) {
        Loan storage loan = loans[user];
        if (loan.principal == 0 || loan.startTime == 0) return 0;
        // Floored to whole minutes (ACCRUAL_STEP): the number quoted on the UI's
        // 60s cycle is then exactly the number charged, so a full repay settles
        // to zero instead of leaving a few sen of principal behind.
        uint256 elapsed = ((block.timestamp - loan.lastRepayTime) / ACCRUAL_STEP) * ACCRUAL_STEP;
        return (loan.principal * currentAprBps() * elapsed) / (10_000 * 365 days);
    }

    function totalDue(address user) public view returns (uint256) {
        return loans[user].principal + accruedInterest(user);
    }

    function healthFactor(address user) public view returns (uint256) {
        return _healthFactor(user);
    }

    function availableToBorrow(address user) public view returns (uint256) {
        Loan storage loan = loans[user];
        uint256 maxBorrow = _maxBorrow(loan.collateral);
        return maxBorrow > loan.principal ? maxBorrow - loan.principal : 0;
    }

    function currentLTV(address user) public view returns (uint256) {
        Loan storage loan = loans[user];
        if (loan.collateral == 0) return 0;
        uint256 collateralMYR = (loan.collateral * ethPrice * MYR_DECIMALS) / PRECISION;
        if (collateralMYR == 0) return 0;
        return (loan.principal * 100) / collateralMYR;
    }

    function getLoanInfo(address user)
        external
        view
        returns (
            uint256 collateral,
            uint256 borrowed,
            uint256 hf,
            uint256 available,
            uint256 collateralValueMYR,
            uint256 interest,
            uint256 ltv,
            bool    isLiquidatable
        )
    {
        Loan storage loan = loans[user];
        uint256 hfVal = _healthFactor(user);
        return (
            loan.collateral,
            loan.principal,
            hfVal,
            availableToBorrow(user),
            (loan.collateral * ethPrice) / PRECISION,
            accruedInterest(user),
            currentLTV(user),
            hfVal < MIN_HEALTH && loan.principal > 0
        );
    }

    /// @notice Supply APR in bps — 38% of the borrow rate passed to depositors.
    function supplyInterestRate() public view returns (uint256) {
        return (baseRateBps * 38) / 100;
    }

    /// @notice MYR interest accrued (6 decimals) since the user first deposited.
    function accruedSupplyInterest(address user) public view returns (uint256) {
        Loan storage loan = loans[user];
        if (loan.collateral == 0 || supplyStart[user] == 0) return 0;
        // Same whole-minute floor as accruedInterest() — see ACCRUAL_STEP.
        uint256 elapsed = ((block.timestamp - supplyStart[user]) / ACCRUAL_STEP) * ACCRUAL_STEP;
        uint256 colMYR  = (loan.collateral * ethPrice * MYR_DECIMALS) / PRECISION;
        return (colMYR * supplyInterestRate() * elapsed) / (10_000 * 365 days);
    }

    /// @notice Claim accumulated supply interest as MYR tokens.
    function claimSupplyInterest() external whenNotPaused nonReentrant {
        uint256 interest = accruedSupplyInterest(msg.sender);
        require(interest > 0, "Nothing to claim");
        supplyStart[msg.sender] = block.timestamp;
        myr.mint(msg.sender, interest);
        emit SupplyInterestClaimed(msg.sender, interest);
    }

    function getProtocolStats()
        external
        view
        returns (
            uint256 _totalBorrowed,
            uint256 _totalCollateral,
            uint256 _protocolFees,
            uint256 _ethPrice,
            uint256 _lastPriceTime
        )
    {
        return (totalBorrowed, totalCollateral, protocolFees, ethPrice, lastPriceTime);
    }

    /// @notice Everything the pool card and the rate breakdown need, in one call.
    /// @dev    Deliberately a NEW view rather than extra returns on
    ///         getProtocolStats(): several callers decode that one into a
    ///         hand-written five-tuple, which would silently misdescribe itself
    ///         if the arity changed.
    function getPoolStats()
        external
        view
        returns (
            uint256 _supplyCap,
            uint256 _totalBorrowed,
            uint256 _available,
            uint256 _utilizationBps,
            uint256 _utilPremiumBps,
            uint256 _currentAprBps
        )
    {
        return (
            supplyCap,
            totalBorrowed,
            availableToBorrowPool(),
            utilizationBps(),
            utilPremiumBps(),
            currentAprBps()
        );
    }

    // ── Internal ────────────────────────────────────────────────────────────

    function _maxBorrow(uint256 collateralWei) internal view returns (uint256) {
        return (collateralWei * ethPrice * MAX_LTV * MYR_DECIMALS) / (PRECISION * 100);
    }

    function _healthFactor(address user) internal view returns (uint256) {
        Loan storage loan = loans[user];
        if (loan.principal == 0) return type(uint256).max;
        uint256 collateralMYR = (loan.collateral * ethPrice * MYR_DECIMALS) / PRECISION;
        return (collateralMYR * LIQ_THRESHOLD * PRECISION) / (100 * loan.principal);
    }
}
