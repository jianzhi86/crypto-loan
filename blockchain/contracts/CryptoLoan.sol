// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./MockMYR.sol";

/// @notice ETH-collateral MYR lending protocol — Nexo-style, fixed-term loans.
///
///         Each borrow is its OWN loan: its principal, its APR (locked at the
///         moment of borrowing), its start date and its due date. Collateral
///         stays one shared pot per borrower — every loan is backed by the
///         same ETH, so LTV and the health factor are computed against the
///         SUM of active principals, while interest and repayment are strictly
///         per-loan. This is what lets "repay plan #2" mean exactly plan #2's
///         principal plus plan #2's interest, and nothing else.
///
///         Loans are fixed-term (1/3/6/12 months). Past the due date a 7-day
///         grace period runs; after that the loan is liquidatable even if the
///         collateral itself is still healthy. Price-crash liquidation
///         (health factor < 1) is unchanged and applies at any time.
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

    /// @notice Extra repayment time after a loan's due date before overdue
    ///         liquidation becomes possible. Not a free extension — interest
    ///         keeps accruing through it — just a shield against being
    ///         liquidated the second the term ends.
    uint256 public constant GRACE_PERIOD = 7 days;

    /// @notice Late penalty charged on top of the debt when the protocol
    ///         recovers a loan the borrower let run past its grace period —
    ///         the price of forcing the protocol to collect. Charged ONLY on
    ///         the overdue path: a position recovered for being underwater is
    ///         unlucky, not delinquent, so it pays no penalty.
    uint256 public latePenaltyBps = 500;              // 5.0%

    /// @notice Ceiling on latePenaltyBps. The owner sets the penalty, so
    ///         without a cap "recover an overdue loan" could be turned into
    ///         "seize the whole pot" by first setting the penalty to 1000%.
    uint256 public constant MAX_LATE_PENALTY_BPS = 2000;  // 20.0%

    // Variable borrow rate, bank-style: a base rate plus premiums that move
    // with market conditions. APR = BASE + utilization premium — see
    // currentAprBps(). The rate a NEW borrow gets; once taken, each loan
    // keeps the APR it was born with for its whole life (loan.aprBps).
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

    /// @notice Interest ticks once per calendar day, so the figure the UI
    ///         quotes is exactly the figure the contract charges — not a
    ///         per-second value that has already moved by the time the user
    ///         signs the transaction.
    uint256 public constant ACCRUAL_STEP = 1 days;

    /// @dev Offset applied before flooring to ACCRUAL_STEP so day boundaries
    ///      land on Malaysia midnight (UTC+8) instead of UTC midnight — this
    ///      is an MYR product, so "today"/"12am" means local time.
    uint256 public constant MYR_TZ_OFFSET = 8 hours;

    // ── State ──────────────────────────────────────────────────────────────
    uint256 public ethPrice;       // MYR per ETH (whole number, e.g. 18000)
    uint256 public prevEthPrice;   // price before the last update (volatility input)
    uint256 public lastPriceTime;  // last price update timestamp
    uint256 public protocolFees;   // accumulated interest revenue (MYR units)
    uint256 public totalBorrowed;  // protocol-wide outstanding debt (MYR units)
    uint256 public totalCollateral;// protocol-wide collateral (wei)

    mapping(address => bool)   public kycApproved;
    mapping(address => bool)   public liquidators; // whitelisted liquidators
    mapping(address => uint256) public supplyStart; // timestamp supply accrual started per depositor

    /// @notice ETH collateral per borrower (wei) — ONE pot backing all of that
    ///         borrower's loans together.
    mapping(address => uint256) public collateralOf;

    /// @notice One entry per borrow. The array index is the loanId — stable
    ///         for the life of the account (repaid/liquidated loans stay in
    ///         place flagged inactive, they are never spliced out).
    struct Loan {
        uint256 principal;     // MYR units (6 decimals) still owed
        uint256 startTime;     // unix timestamp of this borrow
        uint256 dueDate;       // startTime + term
        uint256 lastRepayTime; // interest clock for THIS loan (resets on its repays)
        uint256 termDays;      // 30 / 90 / 180 / 365
        uint256 aprBps;        // APR locked at borrow time — fixed for the loan's life
        uint256 baseBps;       // baseRateBps at the same moment — display split only
                               // (aprBps - baseBps = the utilization premium paid);
                               // never used in interest math, aprBps is
        bool    active;        // false once fully repaid or fully liquidated
    }
    mapping(address => Loan[]) private _userLoans;

    // ── Events ─────────────────────────────────────────────────────────────
    event CollateralDeposited(address indexed user, uint256 amount);
    event Borrowed(address indexed user, uint256 myrAmount, uint256 newTotal);
    event LoanCreated(address indexed borrower, uint256 indexed loanId, uint256 principal, uint256 dueDate, uint256 termDays, uint256 aprBps, uint256 baseBps);
    event Repaid(address indexed user, uint256 indexed loanId, uint256 principal, uint256 interest);
    event LoanClosed(address indexed user, uint256 indexed loanId);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event Liquidated(address indexed user, address indexed liquidator, uint256 debtCovered, uint256 collateralSeized);
    event LoanLiquidated(address indexed borrower, uint256 indexed loanId, uint256 collateralAmount, string reason);
    event PriceUpdated(uint256 oldPrice, uint256 newPrice, address updatedBy);
    event BaseRateUpdated(uint256 oldRateBps, uint256 newRateBps);
    event SupplyCapUpdated(uint256 oldCap, uint256 newCap);
    event KYCSet(address indexed user, bool approved);
    event LiquidatorSet(address indexed liquidator, bool approved);
    event ProtocolFeesWithdrawn(address indexed to, uint256 amount);
    /// @param debtCovered   MYR of principal + interest written off
    /// @param penaltyCharged MYR of late penalty taken on top (0 on the health path)
    /// @param collateralSeized wei taken from the borrower's pot
    event LoanRecovered(
        address indexed borrower,
        uint256 indexed loanId,
        uint256 collateralSeized,
        uint256 debtCovered,
        uint256 penaltyCharged,
        string  reason
    );
    event LatePenaltyUpdated(uint256 oldBps, uint256 newBps);
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

    /// @notice Adjust the late penalty charged by recoverLoan() on the overdue
    ///         path (owner only, capped at MAX_LATE_PENALTY_BPS).
    function setLatePenalty(uint256 penaltyBps) external onlyOwner {
        require(penaltyBps <= MAX_LATE_PENALTY_BPS, "Penalty exceeds cap");
        uint256 old = latePenaltyBps;
        latePenaltyBps = penaltyBps;
        emit LatePenaltyUpdated(old, penaltyBps);
    }

    /// @notice Resize the lending pool (owner only).
    /// @dev Never below what is already lent out. A cap under the outstanding
    ///      debt would push utilizationBps() to 100%, instantly pinning every
    ///      NEW borrow at MAX_BASE_RATE_BPS (existing loans keep their locked
    ///      rate) with no way to lend out of it.
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
        collateralOf[msg.sender] += msg.value;
        totalCollateral          += msg.value;
        emit CollateralDeposited(msg.sender, msg.value);
    }

    /// @notice Open a new fixed-term loan against the shared collateral pot.
    /// @param myrAmount principal in MYR units (6 decimals)
    /// @param termDays  30, 90, 180 or 365 — sets the due date
    function borrow(uint256 myrAmount, uint256 termDays) external whenNotPaused nonReentrant onlyKYC {
        require(myrAmount > 0, "Amount must be > 0");
        require(
            termDays == 30 || termDays == 90 || termDays == 180 || termDays == 365,
            "Invalid term"
        );
        require(collateralOf[msg.sender] > 0, "Deposit collateral first");

        uint256 principalNow = _activePrincipal(msg.sender);
        uint256 maxBorrow    = _maxBorrow(collateralOf[msg.sender]);
        require(principalNow + myrAmount <= maxBorrow, "Exceeds max LTV");
        // Checked after the per-user LTV limit so the more common, more
        // actionable message is the one a borrower normally sees.
        require(totalBorrowed + myrAmount <= supplyCap, "Pool cap reached");

        uint256 loanId = _userLoans[msg.sender].length;
        uint256 due    = block.timestamp + termDays * 1 days;
        // Both rates are captured BEFORE totalBorrowed grows below: the loan
        // locks the utilization the pool had when the borrower committed, not
        // the utilization their own debt creates. (This is also why any APR
        // the UI re-reads AFTER the transaction can come back higher than the
        // locked figure — the receipt must quote the event, not a fresh read.)
        _userLoans[msg.sender].push(Loan({
            principal:     myrAmount,
            startTime:     block.timestamp,
            dueDate:       due,
            lastRepayTime: block.timestamp,
            termDays:      termDays,
            aprBps:        currentAprBps(),   // locked for this loan's whole life
            baseBps:       baseRateBps,
            active:        true
        }));
        totalBorrowed += myrAmount;

        myr.mint(msg.sender, myrAmount);
        emit Borrowed(msg.sender, myrAmount, principalNow + myrAmount);
        emit LoanCreated(msg.sender, loanId, myrAmount, due, termDays, _userLoans[msg.sender][loanId].aprBps, baseRateBps);
    }

    /// @notice Repay ONE loan. Interest paid first, then principal — but only
    ///         THIS loan's interest and THIS loan's principal; other loans are
    ///         untouched. Caller must approve this contract for `myrAmount`.
    ///         Collateral is NOT auto-returned on a full repay — it stays
    ///         deposited so the same collateral can back a new borrow without
    ///         redepositing. Withdraw it explicitly via withdrawCollateral().
    function repay(uint256 loanId, uint256 myrAmount) external whenNotPaused nonReentrant {
        require(myrAmount > 0, "Amount must be > 0");
        uint256 paying = _repayOne(msg.sender, loanId, myrAmount);
        require(paying > 0, "Nothing to repay");
        myr.transferFrom(msg.sender, address(this), paying);
    }

    /// @notice Repay several loans in one transaction — one ERC-20 approval,
    ///         one signature. `amounts[i]` is the cap applied to `loanIds[i]`;
    ///         each loan takes at most its own total due, so over-quoting a
    ///         full payoff can never overcharge. Inactive loans are skipped.
    function repayMany(uint256[] calldata loanIds, uint256[] calldata amounts)
        external
        whenNotPaused
        nonReentrant
    {
        require(loanIds.length > 0 && loanIds.length == amounts.length, "Bad input");
        uint256 total = 0;
        for (uint256 i = 0; i < loanIds.length; i++) {
            total += _repayOne(msg.sender, loanIds[i], amounts[i]);
        }
        require(total > 0, "Nothing to repay");
        myr.transferFrom(msg.sender, address(this), total);
    }

    /// @dev Applies up to `myrAmount` to one loan (interest first, then
    ///      principal), updates all accounting and emits events. Returns the
    ///      MYR actually applied — the caller is responsible for pulling that
    ///      total from the payer in a single transferFrom.
    function _repayOne(address user, uint256 loanId, uint256 myrAmount) internal returns (uint256) {
        require(loanId < _userLoans[user].length, "No such loan");
        Loan storage loan = _userLoans[user][loanId];
        if (!loan.active || myrAmount == 0) return 0;

        uint256 interest = _loanInterest(loan);
        uint256 due      = loan.principal + interest;
        uint256 paying   = myrAmount > due ? due : myrAmount;

        uint256 interestPaid  = paying >= interest ? interest : paying;
        uint256 principalPaid = paying > interest ? paying - interest : 0;

        protocolFees  += interestPaid;
        totalBorrowed -= principalPaid;

        if (principalPaid >= loan.principal) {
            loan.principal     = 0;
            loan.active        = false;
            loan.lastRepayTime = block.timestamp;
            emit Repaid(user, loanId, principalPaid, interestPaid);
            emit LoanClosed(user, loanId);
        } else {
            loan.principal    -= principalPaid;
            loan.lastRepayTime = block.timestamp;
            emit Repaid(user, loanId, principalPaid, interestPaid);
        }
        return paying;
    }

    function withdrawCollateral(uint256 weiAmount) external whenNotPaused nonReentrant {
        require(collateralOf[msg.sender] >= weiAmount, "Not enough collateral");

        uint256 remaining = collateralOf[msg.sender] - weiAmount;
        uint256 principalNow = _activePrincipal(msg.sender);
        if (principalNow > 0) {
            uint256 maxBorrow = _maxBorrow(remaining);
            require(principalNow <= maxBorrow, "Would violate LTV");
        }

        // A full withdrawal ends supply accrual (supplyStart resets below).
        // accruedSupplyInterest() returns 0 once collateral is 0, so anything
        // accrued but not yet claimed must be paid out NOW, before that
        // happens — otherwise it's forfeited with no way to claim it after.
        // Computed while collateralOf still holds its pre-withdrawal value,
        // same as claimSupplyInterest()'s own payout.
        uint256 payout = remaining == 0 ? accruedSupplyInterest(msg.sender) : 0;

        collateralOf[msg.sender] -= weiAmount;
        totalCollateral          -= weiAmount;
        if (collateralOf[msg.sender] == 0) {
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

    /// @notice Liquidate ONE loan, for either of two reasons:
    ///
    ///         A. Collateral unsafe — the account's health factor is below 1
    ///            (ETH price dropped / debt outgrew the collateral). Any
    ///            active loan of the account can be liquidated.
    ///         B. Loan overdue — this specific loan's due date plus the 7-day
    ///            grace period has passed and it still isn't repaid, even if
    ///            the collateral itself is still healthy.
    ///
    ///         The liquidator repays up to `debtAmount` of THIS loan's debt
    ///         (interest + principal) and receives the equivalent collateral
    ///         value plus LIQ_BONUS. Only enough collateral to cover what was
    ///         actually repaid (+ bonus) is seized — whatever remains stays in
    ///         the borrower's pot, withdrawable once their debt allows.
    function liquidate(address borrower, uint256 loanId, uint256 debtAmount)
        external
        whenNotPaused
        nonReentrant
        onlyLiquidator
    {
        require(borrower != address(0), "Zero address");
        require(debtAmount > 0, "Amount must be > 0");
        require(loanId < _userLoans[borrower].length, "No such loan");

        Loan storage loan = _userLoans[borrower][loanId];
        require(loan.active, "Loan not active");

        bool unhealthy = _healthFactor(borrower) < MIN_HEALTH;
        bool overdue   = block.timestamp > loan.dueDate + GRACE_PERIOD;
        require(unhealthy || overdue, "Not liquidatable");

        uint256 interest  = _loanInterest(loan);
        uint256 totalDebt = loan.principal + interest;
        uint256 covering  = debtAmount > totalDebt ? totalDebt : debtAmount;

        // Collateral to seize = debt value in ETH (wei) + liquidation bonus
        // covering is MYR (6 dec), ethPrice is MYR/ETH whole number
        // collateralWei = covering * 1e18 / (ethPrice * 1e6)
        uint256 collateralValue = (covering * PRECISION) / (ethPrice * MYR_DECIMALS);
        uint256 bonus           = (collateralValue * LIQ_BONUS) / 100;
        uint256 seize           = collateralValue + bonus;
        if (seize > collateralOf[borrower]) {
            // Not enough collateral left to fully cover `covering` + bonus —
            // scale the MYR pulled from the liquidator down to match what's
            // actually seizable, so they're never charged for collateral they
            // don't receive.
            seize = collateralOf[borrower];
            collateralValue = (seize * 100) / (100 + LIQ_BONUS);
            covering        = (collateralValue * ethPrice * MYR_DECIMALS) / PRECISION;
        }

        // Pull MYR from liquidator
        myr.transferFrom(msg.sender, address(this), covering);

        uint256 interestCovered  = covering >= interest ? interest : covering;
        uint256 principalCovered = covering > interest ? covering - interest : 0;

        protocolFees  += interestCovered;
        totalBorrowed -= principalCovered;

        loan.principal        -= principalCovered;
        loan.lastRepayTime     = block.timestamp;
        collateralOf[borrower] -= seize;
        totalCollateral        -= seize;

        if (loan.principal == 0) {
            loan.active = false;
            emit LoanClosed(borrower, loanId);
        }

        (bool ok, ) = payable(msg.sender).call{value: seize}("");
        require(ok, "ETH transfer failed");

        emit Liquidated(borrower, msg.sender, covering, seize);
        emit LoanLiquidated(borrower, loanId, seize, unhealthy ? "collateral unsafe" : "loan overdue");
    }

    /// @notice Protocol-side recovery of ONE loan, settled out of collateral
    ///         instead of out of a liquidator's pocket.
    ///
    ///         liquidate() needs a third party holding MYR to make the pool
    ///         whole, and earns them LIQ_BONUS for it. That is the right shape
    ///         for an open market, but it leaves the protocol unable to act on
    ///         a delinquent borrower when no such party shows up — and the
    ///         owner is exactly the account that never holds MYR, since MYR
    ///         only enters circulation through borrow(). This is the fallback:
    ///         the owner writes the debt off and takes the equivalent
    ///         collateral, with no MYR changing hands at all.
    ///
    ///         Two triggers, and they are NOT priced the same:
    ///
    ///         A. Collateral unsafe (health factor < 1). No penalty — a price
    ///            crash is misfortune, not delinquency.
    ///         B. Past dueDate + GRACE_PERIOD. latePenaltyBps is charged on top
    ///            of the debt, which is the cost of ignoring the deadline.
    ///
    ///         Seizure is capped at what the borrower actually has, and the
    ///         debt is settled BEFORE the penalty out of whatever the seizure
    ///         is worth — so a pot too small to cover everything shortchanges
    ///         the protocol's penalty, never inflates the borrower's remaining
    ///         debt. Anything left in the pot after the loan is square stays
    ///         the borrower's, exactly as under liquidate().
    ///
    ///         Earnings split across two ledgers, by necessity rather than
    ///         design: the interest and the late penalty are booked as MYR
    ///         protocolFees (minted to back the credit — see below), while the
    ///         seized ETH itself goes to the owner as recovery of the capital
    ///         that was lent out. Strictly this books the revenue slice in both
    ///         places at once; on a chain whose MYR is minted on demand and
    ///         backed by nothing that is a modelling choice, not a solvency
    ///         problem, and it is what makes protocolFees meaningful as
    ///         "everything the protocol earned".
    function recoverLoan(address borrower, uint256 loanId)
        external
        onlyOwner
        whenNotPaused
        nonReentrant
        returns (uint256 seized, uint256 debtCovered, uint256 penaltyCharged)
    {
        require(borrower != address(0), "Zero address");
        require(loanId < _userLoans[borrower].length, "No such loan");

        Loan storage loan = _userLoans[borrower][loanId];
        require(loan.active, "Loan not active");

        bool unhealthy = _healthFactor(borrower) < MIN_HEALTH;
        bool overdue   = block.timestamp > loan.dueDate + GRACE_PERIOD;
        require(unhealthy || overdue, "Not recoverable");

        uint256 interest = _loanInterest(loan);
        uint256 debt     = loan.principal + interest;
        // Penalty rides on the overdue trigger only. A loan that is BOTH
        // underwater and overdue is still delinquent, so it still pays.
        uint256 penalty  = overdue ? (debt * latePenaltyBps) / 10_000 : 0;

        uint256 wanted = ((debt + penalty) * PRECISION) / (ethPrice * MYR_DECIMALS);
        uint256 pot    = collateralOf[borrower];
        seized = wanted > pot ? pot : wanted;
        require(seized > 0, "No collateral to seize");

        // What the seized ETH is actually worth, re-derived at the same price.
        // Integer division makes this <= debt + penalty, never more.
        uint256 realised = (seized * ethPrice * MYR_DECIMALS) / PRECISION;

        debtCovered    = realised > debt ? debt : realised;
        penaltyCharged = realised - debtCovered;

        uint256 interestCovered  = debtCovered > interest ? interest : debtCovered;
        uint256 principalCovered = debtCovered - interestCovered;

        // Interest earns for the protocol however the loan ends — repaid on
        // time, repaid late, or collected here — and the late penalty is
        // revenue on the same footing. Booking both into protocolFees is what
        // makes "Protocol Fees (withdrawable)" mean total earnings rather than
        // only the earnings from borrowers who paid voluntarily.
        //
        // The mint is what makes that credit real. protocolFees is denominated
        // in MYR and withdrawProtocolFees() pays it out with myr.transfer(), so
        // a credit with no tokens behind it would make the sweep revert. No MYR
        // arrives in a recovery — the borrower keeps what they borrowed and the
        // protocol takes ETH — so the revenue slice is minted to this contract
        // to back it. Minting is how MYR enters circulation everywhere else
        // here (borrow, buyMYR, supply interest), so this is consistent with
        // the rest of the system rather than a special case.
        uint256 revenueMYR = interestCovered + penaltyCharged;
        if (revenueMYR > 0) {
            myr.mint(address(this), revenueMYR);
            protocolFees += revenueMYR;
        }

        totalBorrowed  -= principalCovered;
        loan.principal -= principalCovered;
        // The interest just settled is paid; restart this loan's clock so a
        // partial recovery cannot re-charge the same days.
        loan.lastRepayTime = block.timestamp;

        collateralOf[borrower] -= seized;
        totalCollateral        -= seized;
        // Mirrors withdrawCollateral(): an emptied pot stops supply accrual.
        if (collateralOf[borrower] == 0) {
            supplyStart[borrower] = 0;
        }

        if (loan.principal == 0) {
            loan.active = false;
            emit LoanClosed(borrower, loanId);
        }

        (bool ok, ) = payable(owner()).call{value: seized}("");
        require(ok, "ETH transfer failed");

        emit LoanRecovered(
            borrower, loanId, seized, debtCovered, penaltyCharged,
            overdue ? "overdue past grace" : "collateral unsafe"
        );
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
    ///         rate plus a utilization premium of up to UTIL_SLOPE_BPS as the
    ///         pool fills, hard-capped at MAX_BASE_RATE_BPS.
    ///
    ///         This prices NEW borrows only. Each loan locks this figure into
    ///         loan.aprBps at creation and accrues at that fixed rate for its
    ///         whole life — the Repay tab's per-plan interest, the payoff
    ///         quote and the ledger all read the LOCKED rate, never this one.
    ///
    ///         VOL_SLOPE_BPS stays defined but unapplied: it would move the rate
    ///         on a price update, which a borrower can neither observe before it
    ///         happens nor mirror from a single view call.
    function currentAprBps() public view returns (uint256) {
        uint256 rate = baseRateBps + utilPremiumBps();
        return rate > MAX_BASE_RATE_BPS ? MAX_BASE_RATE_BPS : rate;
    }

    /// @dev One loan's accrued interest at ITS locked rate. Anchored to
    ///      calendar days at Malaysia midnight (UTC+8 — this is an MYR
    ///      product, so "today"/"12am" means local time, not UTC), not a
    ///      rolling 24h window: interest is owed for the borrow date itself,
    ///      and each local calendar date crossed after that adds one more
    ///      day's interest.
    ///
    ///      The borrow-date charge applies ONLY before this loan's first ever
    ///      repay (lastRepayTime == startTime): dayDiff counts the midnights
    ///      crossed, so the borrow date itself goes on top — a same-day
    ///      borrow-then-repay owes that one day, and the first midnight makes
    ///      it two. It must NOT be added again after a repay: the repay
    ///      collected interest through its own date and reset lastRepayTime,
    ///      so adding it once more would charge a phantom day on every
    ///      same-day partial payment, silently eating each one.
    function _loanInterest(Loan storage loan) internal view returns (uint256) {
        if (!loan.active || loan.principal == 0) return 0;
        uint256 lastDay = (loan.lastRepayTime + MYR_TZ_OFFSET) / ACCRUAL_STEP;
        uint256 curDay  = (block.timestamp + MYR_TZ_OFFSET) / ACCRUAL_STEP;
        uint256 dayDiff = curDay - lastDay;
        bool firstAccrual = loan.lastRepayTime == loan.startTime;
        uint256 elapsed = (firstAccrual ? dayDiff + 1 : dayDiff) * ACCRUAL_STEP;
        return (loan.principal * loan.aprBps * elapsed) / (10_000 * 365 days);
    }

    /// @notice Interest accrued on ONE loan, at that loan's locked APR.
    function accruedInterestForLoan(address user, uint256 loanId) public view returns (uint256) {
        require(loanId < _userLoans[user].length, "No such loan");
        return _loanInterest(_userLoans[user][loanId]);
    }

    /// @notice Everything still owed on ONE loan: principal + accrued interest.
    function loanDue(address user, uint256 loanId) public view returns (uint256) {
        require(loanId < _userLoans[user].length, "No such loan");
        Loan storage loan = _userLoans[user][loanId];
        return loan.principal + _loanInterest(loan);
    }

    /// @notice Aggregate interest across every active loan (sum of per-loan
    ///         accruals at each loan's own locked rate).
    function accruedInterest(address user) public view returns (uint256) {
        Loan[] storage arr = _userLoans[user];
        uint256 sum = 0;
        for (uint256 i = 0; i < arr.length; i++) {
            sum += _loanInterest(arr[i]);
        }
        return sum;
    }

    /// @notice Aggregate debt: all active principals + all accrued interest.
    function totalDue(address user) public view returns (uint256) {
        return _activePrincipal(user) + accruedInterest(user);
    }

    function healthFactor(address user) public view returns (uint256) {
        return _healthFactor(user);
    }

    function availableToBorrow(address user) public view returns (uint256) {
        uint256 maxBorrow = _maxBorrow(collateralOf[user]);
        uint256 principal = _activePrincipal(user);
        return maxBorrow > principal ? maxBorrow - principal : 0;
    }

    function currentLTV(address user) public view returns (uint256) {
        if (collateralOf[user] == 0) return 0;
        uint256 collateralMYR = (collateralOf[user] * ethPrice * MYR_DECIMALS) / PRECISION;
        if (collateralMYR == 0) return 0;
        return (_activePrincipal(user) * 100) / collateralMYR;
    }

    /// @notice True when this specific loan can be liquidated right now, and why.
    /// @return liquidatable whether liquidate() would accept it
    /// @return unhealthy    health factor < 1 (collateral-risk path)
    /// @return overdue      past dueDate + GRACE_PERIOD (maturity path)
    function isLoanLiquidatable(address user, uint256 loanId)
        public
        view
        returns (bool liquidatable, bool unhealthy, bool overdue)
    {
        require(loanId < _userLoans[user].length, "No such loan");
        Loan storage loan = _userLoans[user][loanId];
        if (!loan.active) return (false, false, false);
        unhealthy    = _healthFactor(user) < MIN_HEALTH;
        overdue      = block.timestamp > loan.dueDate + GRACE_PERIOD;
        liquidatable = unhealthy || overdue;
    }

    /// @notice What recoverLoan() would do to this loan right now, without
    ///         doing it. Exposed so the admin panel can show the exact figures
    ///         it is about to authorise instead of re-deriving them off-chain
    ///         and drifting from the contract the moment either formula moves.
    /// @return recoverable whether recoverLoan() would accept it
    /// @return unhealthy   health factor < 1
    /// @return overdue     past dueDate + GRACE_PERIOD (the penalty trigger)
    /// @return debt        principal + accrued interest, MYR units
    /// @return penalty     late penalty that would be charged, MYR units
    /// @return seizeWei    collateral that would actually be taken
    function recoveryQuote(address borrower, uint256 loanId)
        external
        view
        returns (
            bool recoverable, bool unhealthy, bool overdue,
            uint256 debt, uint256 penalty, uint256 seizeWei
        )
    {
        require(loanId < _userLoans[borrower].length, "No such loan");
        Loan storage loan = _userLoans[borrower][loanId];
        if (!loan.active) return (false, false, false, 0, 0, 0);

        unhealthy   = _healthFactor(borrower) < MIN_HEALTH;
        overdue     = block.timestamp > loan.dueDate + GRACE_PERIOD;
        recoverable = unhealthy || overdue;

        debt    = loan.principal + _loanInterest(loan);
        penalty = overdue ? (debt * latePenaltyBps) / 10_000 : 0;

        uint256 wanted = ((debt + penalty) * PRECISION) / (ethPrice * MYR_DECIMALS);
        uint256 pot    = collateralOf[borrower];
        seizeWei = wanted > pot ? pot : wanted;
    }

    /// @notice The whole loan book for one borrower, plus each loan's live
    ///         accrued interest (index = loanId). Inactive (repaid/liquidated)
    ///         loans are included so ids stay stable; their interest is 0.
    function getUserLoans(address user)
        external
        view
        returns (Loan[] memory loansOut, uint256[] memory interests)
    {
        Loan[] storage arr = _userLoans[user];
        loansOut  = new Loan[](arr.length);
        interests = new uint256[](arr.length);
        for (uint256 i = 0; i < arr.length; i++) {
            loansOut[i]  = arr[i];
            interests[i] = _loanInterest(arr[i]);
        }
    }

    function loanCount(address user) external view returns (uint256) {
        return _userLoans[user].length;
    }

    /// @notice Minimal position summary — what server-side guards need to know
    ///         before allowing wallet unlinking etc.
    function getPosition(address user) external view returns (uint256 collateral, uint256 principal) {
        return (collateralOf[user], _activePrincipal(user));
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
        uint256 hfVal     = _healthFactor(user);
        uint256 principal = _activePrincipal(user);
        // Liquidatable = collateral-risk on the whole account OR any single
        // loan past its due date + grace.
        bool anyOverdue = false;
        Loan[] storage arr = _userLoans[user];
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i].active && block.timestamp > arr[i].dueDate + GRACE_PERIOD) {
                anyOverdue = true;
                break;
            }
        }
        return (
            collateralOf[user],
            principal,
            hfVal,
            availableToBorrow(user),
            (collateralOf[user] * ethPrice) / PRECISION,
            accruedInterest(user),
            currentLTV(user),
            (hfVal < MIN_HEALTH && principal > 0) || anyOverdue
        );
    }

    /// @notice Supply APR in bps — 38% of the CURRENT effective borrow rate
    ///         (base + utilization premium, same figure new borrowers pay), so
    ///         lender yield tracks real market demand instead of the flat floor.
    function supplyInterestRate() public view returns (uint256) {
        return (currentAprBps() * 38) / 100;
    }

    /// @notice MYR interest accrued (6 decimals) since the user first deposited.
    function accruedSupplyInterest(address user) public view returns (uint256) {
        if (collateralOf[user] == 0 || supplyStart[user] == 0) return 0;
        // Rolling whole-day floor (UTC, not the local-midnight anchoring
        // _loanInterest() uses) — see ACCRUAL_STEP.
        uint256 elapsed = ((block.timestamp - supplyStart[user]) / ACCRUAL_STEP) * ACCRUAL_STEP;
        uint256 colMYR  = (collateralOf[user] * ethPrice * MYR_DECIMALS) / PRECISION;
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

    /// @dev Sum of the still-owed principal across this user's ACTIVE loans —
    ///      the debt figure LTV, health factor and borrow limits run on.
    function _activePrincipal(address user) internal view returns (uint256) {
        Loan[] storage arr = _userLoans[user];
        uint256 sum = 0;
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i].active) sum += arr[i].principal;
        }
        return sum;
    }

    function _maxBorrow(uint256 collateralWei) internal view returns (uint256) {
        return (collateralWei * ethPrice * MAX_LTV * MYR_DECIMALS) / (PRECISION * 100);
    }

    function _healthFactor(address user) internal view returns (uint256) {
        uint256 principal = _activePrincipal(user);
        if (principal == 0) return type(uint256).max;
        uint256 collateralMYR = (collateralOf[user] * ethPrice * MYR_DECIMALS) / PRECISION;
        return (collateralMYR * LIQ_THRESHOLD * PRECISION) / (100 * principal);
    }
}
