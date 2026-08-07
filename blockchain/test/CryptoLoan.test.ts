import { expect } from "chai";
import { ethers } from "hardhat";
import { CryptoLoan, MockMYR } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const ETH_PRICE   = 18_000n;          // RM 18,000 per ETH
const ONE_ETH     = ethers.parseEther("1");
const MYR_6       = 1_000_000n;       // 1 MYR in 6-decimal units
const MAX_LTV     = 70n;
const DAY         = 24 * 3600;
const GRACE       = 7 * DAY;

describe("CryptoLoan", function () {
  let loan: CryptoLoan;
  let myr:  MockMYR;
  let owner:     HardhatEthersSigner;
  let user:      HardhatEthersSigner;
  let liquidator: HardhatEthersSigner;
  let other:     HardhatEthersSigner;

  beforeEach(async () => {
    [owner, user, liquidator, other] = await ethers.getSigners();

    const LoanFactory = await ethers.getContractFactory("CryptoLoan");
    loan = await LoanFactory.deploy(ETH_PRICE);
    await loan.waitForDeployment();

    const myrAddress = await loan.myr();
    myr = await ethers.getContractAt("MockMYR", myrAddress);

    // KYC user
    await loan.connect(owner).setKYC(user.address, true);
    // Whitelist liquidator
    await loan.connect(owner).setLiquidator(liquidator.address, true);
  });

  // Mint MYR to an account via owner acting as a proxy borrower — used to
  // fund interest payments and liquidator balances.
  async function topUp(to: HardhatEthersSigner, amount: bigint) {
    await loan.connect(owner).setKYC(owner.address, true);
    const [ownerCollateral] = await loan.getPosition(owner.address);
    if (ownerCollateral === 0n) {
      await loan.connect(owner).depositCollateral({ value: ONE_ETH * 100n });
    }
    await loan.connect(owner).borrow(amount, 30n);
    await myr.connect(owner).transfer(to.address, amount);
  }

  // ── Deployment ────────────────────────────────────────────────────────────
  describe("Deployment", () => {
    it("sets owner via Ownable2Step", async () => {
      expect(await loan.owner()).to.equal(owner.address);
    });

    it("sets initial ETH price", async () => {
      expect(await loan.ethPrice()).to.equal(ETH_PRICE);
    });

    it("deploys MockMYR with 6 decimals", async () => {
      expect(await myr.decimals()).to.equal(6);
    });

    it("reverts if deployed with zero price", async () => {
      const F = await ethers.getContractFactory("CryptoLoan");
      await expect(F.deploy(0n)).to.be.revertedWith("Invalid price");
    });
  });

  // ── KYC ───────────────────────────────────────────────────────────────────
  describe("KYC", () => {
    it("owner can approve and revoke KYC", async () => {
      await loan.connect(owner).setKYC(other.address, true);
      expect(await loan.kycApproved(other.address)).to.be.true;

      await loan.connect(owner).setKYC(other.address, false);
      expect(await loan.kycApproved(other.address)).to.be.false;
    });

    it("non-owner cannot set KYC", async () => {
      await expect(
        loan.connect(user).setKYC(other.address, true)
      ).to.be.revertedWithCustomError(loan, "OwnableUnauthorizedAccount");
    });

    it("non-KYC user cannot borrow", async () => {
      await loan.connect(other).depositCollateral({ value: ONE_ETH });
      await expect(
        loan.connect(other).borrow(1000n * MYR_6, 30n)
      ).to.be.revertedWith("KYC required");
    });
  });

  // ── Price ─────────────────────────────────────────────────────────────────
  describe("setEthPrice", () => {
    it("owner can update price within 20%", async () => {
      const newPrice = ETH_PRICE + (ETH_PRICE * 19n) / 100n; // +19%
      await expect(loan.connect(owner).setEthPrice(newPrice))
        .to.emit(loan, "PriceUpdated")
        .withArgs(ETH_PRICE, newPrice, owner.address);
    });

    it("reverts if price moves > 20%", async () => {
      const newPrice = ETH_PRICE + (ETH_PRICE * 21n) / 100n; // +21%
      await expect(
        loan.connect(owner).setEthPrice(newPrice)
      ).to.be.revertedWith("Price move too large");
    });

    it("reverts if price is 0", async () => {
      await expect(loan.connect(owner).setEthPrice(0n)).to.be.revertedWith("Invalid price");
    });
  });

  // ── Collateral ────────────────────────────────────────────────────────────
  describe("depositCollateral / withdrawCollateral", () => {
    it("accepts ETH deposits and tracks totalCollateral", async () => {
      await expect(loan.connect(user).depositCollateral({ value: ONE_ETH }))
        .to.emit(loan, "CollateralDeposited")
        .withArgs(user.address, ONE_ETH);

      expect(await loan.totalCollateral()).to.equal(ONE_ETH);
      expect(await loan.collateralOf(user.address)).to.equal(ONE_ETH);
    });

    it("allows full withdrawal when no debt", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await expect(loan.connect(user).withdrawCollateral(ONE_ETH))
        .to.emit(loan, "CollateralWithdrawn")
        .withArgs(user.address, ONE_ETH);
    });

    it("blocks withdrawal that would breach LTV", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      // 1 ETH @ 18000 MYR → max borrow = 18000 * 0.70 = 12600 MYR
      const borrow = 12_600n * MYR_6;
      await loan.connect(user).borrow(borrow, 90n);

      // Trying to withdraw any collateral would push LTV over 70%
      await expect(
        loan.connect(user).withdrawCollateral(ONE_ETH / 2n)
      ).to.be.revertedWith("Would violate LTV");
    });

    it("unlocks collateral after every loan is repaid", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await loan.connect(user).borrow(5_000n * MYR_6, 30n);
      await topUp(user, 1_000n * MYR_6);   // interest headroom
      await myr.connect(user).approve(await loan.getAddress(), 6_000n * MYR_6);
      await loan.connect(user).repay(0n, 6_000n * MYR_6);

      await expect(loan.connect(user).withdrawCollateral(ONE_ETH))
        .to.emit(loan, "CollateralWithdrawn");
    });

    it("reverts sending 0 ETH", async () => {
      await expect(
        loan.connect(user).depositCollateral({ value: 0n })
      ).to.be.revertedWith("Send ETH");
    });
  });

  // ── Borrow (fixed-term loans) ─────────────────────────────────────────────
  describe("borrow", () => {
    beforeEach(async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
    });

    it("mints MYR up to max LTV", async () => {
      const maxBorrow = (ONE_ETH * ETH_PRICE * MAX_LTV * MYR_6) / (10n ** 18n * 100n);
      await expect(loan.connect(user).borrow(maxBorrow, 90n))
        .to.emit(loan, "Borrowed")
        .withArgs(user.address, maxBorrow, maxBorrow);
      expect(await myr.balanceOf(user.address)).to.equal(maxBorrow);
    });

    it("records startTime, dueDate, term and locked APR + base split on the loan", async () => {
      const apr  = await loan.currentAprBps();
      const base = await loan.baseRateBps();
      await loan.connect(user).borrow(5_000n * MYR_6, 90n);
      const now = BigInt(await time.latest());

      const [loans, interests] = await loan.getUserLoans(user.address);
      expect(loans.length).to.equal(1);
      expect(interests.length).to.equal(1);
      expect(loans[0].principal).to.equal(5_000n * MYR_6);
      expect(loans[0].startTime).to.equal(now);
      expect(loans[0].dueDate).to.equal(now + 90n * BigInt(DAY));
      expect(loans[0].termDays).to.equal(90n);
      expect(loans[0].aprBps).to.equal(apr);
      expect(loans[0].baseBps).to.equal(base);
      expect(loans[0].active).to.be.true;
    });

    it("locks the PRE-borrow rate — a fresh read after the tx can be higher", async () => {
      // The borrow itself raises utilization; the loan must keep the rate the
      // pool had when the borrower committed, not the one their debt creates.
      await loan.connect(owner).setSupplyCap(20_000n * MYR_6);
      const aprBefore = await loan.currentAprBps();
      await loan.connect(user).borrow(10_000n * MYR_6, 90n);   // 50% of the pool
      const aprAfter = await loan.currentAprBps();

      const [loans] = await loan.getUserLoans(user.address);
      expect(loans[0].aprBps).to.equal(aprBefore);
      expect(aprAfter).to.be.gt(aprBefore);
    });

    it("emits LoanCreated with loanId, dueDate and the rate split", async () => {
      const tx = await loan.connect(user).borrow(5_000n * MYR_6, 180n);
      const now = BigInt(await time.latest());
      await expect(tx)
        .to.emit(loan, "LoanCreated")
        .withArgs(user.address, 0n, 5_000n * MYR_6, now + 180n * BigInt(DAY), 180n, await loan.currentAprBps(), await loan.baseRateBps());
    });

    it("accepts only the 30/90/180/365 day terms", async () => {
      await expect(loan.connect(user).borrow(1_000n * MYR_6, 45n))
        .to.be.revertedWith("Invalid term");
      for (const term of [30n, 90n, 180n, 365n]) {
        await expect(loan.connect(user).borrow(100n * MYR_6, term)).to.emit(loan, "LoanCreated");
      }
    });

    it("each borrow is its own loan; LTV is enforced on the aggregate", async () => {
      const maxBorrow = (ONE_ETH * ETH_PRICE * MAX_LTV * MYR_6) / (10n ** 18n * 100n);
      await loan.connect(user).borrow(maxBorrow / 2n, 30n);
      await loan.connect(user).borrow(maxBorrow / 2n, 365n);
      await expect(loan.connect(user).borrow(1n, 30n)).to.be.revertedWith("Exceeds max LTV");

      const [loans] = await loan.getUserLoans(user.address);
      expect(loans.length).to.equal(2);
      const [, principal] = await loan.getPosition(user.address);
      expect(principal).to.equal(maxBorrow);
    });

    it("tracks totalBorrowed", async () => {
      const amt = 5_000n * MYR_6;
      await loan.connect(user).borrow(amt, 30n);
      expect(await loan.totalBorrowed()).to.equal(amt);
    });
  });

  // ── Repay (per-loan) ──────────────────────────────────────────────────────
  describe("repay", () => {
    const borrowed = 5_000n * MYR_6;

    beforeEach(async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await loan.connect(user).borrow(borrowed, 90n);
    });

    it("repays a loan in full and marks it inactive", async () => {
      // Pass 2x borrowed — contract caps to the loan's actual due at execution.
      const cap = borrowed * 2n;
      await topUp(user, borrowed);
      await myr.connect(user).approve(await loan.getAddress(), cap);
      await expect(loan.connect(user).repay(0n, cap)).to.emit(loan, "LoanClosed").withArgs(user.address, 0n);

      const [loans] = await loan.getUserLoans(user.address);
      expect(loans[0].principal).to.equal(0n);
      expect(loans[0].active).to.be.false;
      const [, principal] = await loan.getPosition(user.address);
      expect(principal).to.equal(0n);
    });

    it("repaying one loan leaves the other loan untouched", async () => {
      await loan.connect(user).borrow(2_000n * MYR_6, 30n);   // loanId 1
      await time.increase(30 * DAY);

      const due0 = await loan.loanDue(user.address, 0n);
      const int1Before = await loan.accruedInterestForLoan(user.address, 1n);
      expect(int1Before).to.be.gt(0n);

      await topUp(user, due0);
      await myr.connect(user).approve(await loan.getAddress(), due0 * 2n);
      await loan.connect(user).repay(0n, due0 * 2n);

      const [loans] = await loan.getUserLoans(user.address);
      expect(loans[0].active).to.be.false;
      // Loan 1 keeps its full principal AND its own accrued interest — paying
      // loan 0 must not have consumed loan 1's interest.
      expect(loans[1].active).to.be.true;
      expect(loans[1].principal).to.equal(2_000n * MYR_6);
      expect(await loan.accruedInterestForLoan(user.address, 1n)).to.be.gte(int1Before);
    });

    it("interest accrues at the LOCKED rate over 1 year", async () => {
      const [loans] = await loan.getUserLoans(user.address);
      const lockedApr = loans[0].aprBps;
      await time.increase(365 * DAY);
      const interest = await loan.accruedInterestForLoan(user.address, 0n);
      const expected = (borrowed * lockedApr) / 10_000n;
      expect(interest).to.be.closeTo(expected, expected / 100n);
    });

    it("partial repay pays interest first, then principal", async () => {
      await time.increase(30 * DAY);
      const interest = await loan.accruedInterestForLoan(user.address, 0n);
      expect(interest).to.be.gt(0n);

      const pay = interest + 1_000n * MYR_6;
      await topUp(user, pay);
      await myr.connect(user).approve(await loan.getAddress(), pay);
      await expect(loan.connect(user).repay(0n, pay))
        .to.emit(loan, "Repaid");

      const [loans] = await loan.getUserLoans(user.address);
      // Interest may tick up a step between quote and execution; principal
      // must have dropped by (pay - actual interest) which is <= 1000 MYR.
      expect(loans[0].principal).to.be.gte(borrowed - 1_000n * MYR_6);
      expect(loans[0].principal).to.be.lt(borrowed);
      expect(loans[0].active).to.be.true;
    });

    it("repayMany settles several loans in one transaction", async () => {
      await loan.connect(user).borrow(2_000n * MYR_6, 30n);   // loanId 1
      await time.increase(10 * DAY);

      const due0 = await loan.loanDue(user.address, 0n);
      const due1 = await loan.loanDue(user.address, 1n);
      await topUp(user, due0 + due1);
      await myr.connect(user).approve(await loan.getAddress(), (due0 + due1) * 2n);
      await loan.connect(user).repayMany([0n, 1n], [due0 * 2n, due1 * 2n]);

      const [loans] = await loan.getUserLoans(user.address);
      expect(loans[0].active).to.be.false;
      expect(loans[1].active).to.be.false;
      const [, principal] = await loan.getPosition(user.address);
      expect(principal).to.equal(0n);
    });

    it("repaying exactly loanDue() clears the loan to zero", async () => {
      await time.increase(10 * DAY);
      const due = await loan.loanDue(user.address, 0n);
      await topUp(user, 1_000n * MYR_6);
      await myr.connect(user).approve(await loan.getAddress(), due);
      await loan.connect(user).repay(0n, due);

      const [loans] = await loan.getUserLoans(user.address);
      expect(loans[0].principal).to.equal(0n);
      expect(loans[0].active).to.be.false;
    });

    it("reverts when the loan is already repaid", async () => {
      await topUp(user, borrowed);
      const cap = borrowed * 2n;
      await myr.connect(user).approve(await loan.getAddress(), cap);
      await loan.connect(user).repay(0n, cap);
      await expect(loan.connect(user).repay(0n, 1n)).to.be.revertedWith("Nothing to repay");
    });

    it("reverts for an unknown loanId", async () => {
      await expect(loan.connect(user).repay(9n, 1n)).to.be.revertedWith("No such loan");
    });
  });

  // ── Health Factor / LTV ───────────────────────────────────────────────────
  describe("healthFactor / currentLTV", () => {
    it("returns max uint256 when no debt", async () => {
      expect(await loan.healthFactor(user.address)).to.equal(ethers.MaxUint256);
    });

    it("is above MIN_HEALTH at 70% LTV", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      const maxBorrow = (ONE_ETH * ETH_PRICE * MAX_LTV * MYR_6) / (10n ** 18n * 100n);
      await loan.connect(user).borrow(maxBorrow, 90n);

      const hf = await loan.healthFactor(user.address);
      const MIN_HEALTH = 10n ** 18n;
      expect(hf).to.be.gt(MIN_HEALTH);
    });

    it("currentLTV reflects borrow correctly", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      const half = (ONE_ETH * ETH_PRICE * 35n * MYR_6) / (10n ** 18n * 100n); // 35%
      await loan.connect(user).borrow(half, 30n);
      const ltv = await loan.currentLTV(user.address);
      expect(ltv).to.be.closeTo(35n, 1n);
    });
  });

  // ── Liquidation: scenario A — ETH price crash ─────────────────────────────
  describe("liquidate — collateral risk (HF < 1)", () => {
    it("liquidates an underwater position", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      const maxBorrowOld = (ONE_ETH * ETH_PRICE * MAX_LTV * MYR_6) / (10n ** 18n * 100n);
      await loan.connect(user).borrow(maxBorrowOld, 90n);

      // Drop price 20% — user's position is now undercollateralised
      const newPrice = (ETH_PRICE * 80n) / 100n;
      await loan.connect(owner).setEthPrice(newPrice);

      // Liquidator borrows at the NEW (lower) price so they don't exceed LTV
      await loan.connect(owner).setKYC(liquidator.address, true);
      await loan.connect(liquidator).depositCollateral({ value: ONE_ETH * 3n });
      const maxBorrowNew = (ONE_ETH * 3n * newPrice * MAX_LTV * MYR_6) / (10n ** 18n * 100n);
      await loan.connect(liquidator).borrow(maxBorrowNew, 30n);

      const hf = await loan.healthFactor(user.address);
      expect(hf).to.be.lt(10n ** 18n);

      const debtToCover = maxBorrowOld / 2n;
      await myr.connect(liquidator).approve(await loan.getAddress(), debtToCover);
      await expect(
        loan.connect(liquidator).liquidate(user.address, 0n, debtToCover)
      ).to.emit(loan, "LoanLiquidated")
       .withArgs(user.address, 0n, (debtToCover * 10n ** 18n * 105n) / (newPrice * MYR_6 * 100n), "collateral unsafe");
    });

    it("seizes only enough collateral to cover the debt + bonus — the rest stays the borrower's", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH * 2n });
      // Borrow LESS than the max so a 20% price drop leaves plenty of spare
      // collateral value after covering the debt.
      const principal = 10_000n * MYR_6;
      await loan.connect(user).borrow(principal, 90n);

      // Make the position unhealthy by borrowing near max first
      const maxBorrow = (ONE_ETH * 2n * ETH_PRICE * MAX_LTV * MYR_6) / (10n ** 18n * 100n);
      await loan.connect(user).borrow(maxBorrow - principal, 90n);   // loanId 1
      const newPrice = (ETH_PRICE * 80n) / 100n;
      await loan.connect(owner).setEthPrice(newPrice);
      expect(await loan.healthFactor(user.address)).to.be.lt(10n ** 18n);

      // Cover loan 0's FULL debt (principal + interest) — over-quote and let
      // the contract cap at the real due, so the loan actually closes.
      const due0 = await loan.loanDue(user.address, 0n);
      await topUp(liquidator, due0 * 2n);
      await myr.connect(liquidator).approve(await loan.getAddress(), due0 * 2n);

      const collateralBefore = await loan.collateralOf(user.address);
      await loan.connect(liquidator).liquidate(user.address, 0n, due0 * 2n);
      const collateralAfter = await loan.collateralOf(user.address);

      // Seized = debt value in ETH at the crashed price + 5% bonus — NOT the
      // whole pot.
      const expectedSeize = (due0 * 10n ** 18n * 105n) / (newPrice * MYR_6 * 100n);
      expect(collateralBefore - collateralAfter).to.be.closeTo(expectedSeize, expectedSeize / 50n);
      expect(collateralAfter).to.be.gt(0n);

      // Loan 0 fully covered → closed; loan 1 still active.
      const [loans] = await loan.getUserLoans(user.address);
      expect(loans[0].active).to.be.false;
      expect(loans[1].active).to.be.true;
    });

    it("scales down the MYR pulled from the liquidator when collateral can't cover debt + bonus", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      const principal = (ONE_ETH * ETH_PRICE * MAX_LTV * MYR_6) / (10n ** 18n * 100n);
      await loan.connect(user).borrow(principal, 90n);

      // Crash the price hard enough that collateralValue + 5% bonus for the
      // full debt would exceed the 1 ETH actually deposited (two successive
      // 20%-max drops: 18000 -> 14400 -> 11520).
      await loan.connect(owner).setEthPrice((ETH_PRICE * 80n) / 100n);
      const crashedPrice = (((ETH_PRICE * 80n) / 100n) * 80n) / 100n;
      await loan.connect(owner).setEthPrice(crashedPrice);

      await loan.connect(owner).setKYC(liquidator.address, true);
      await loan.connect(liquidator).depositCollateral({ value: ONE_ETH * 3n });
      const liquidatorMaxBorrow = (ONE_ETH * 3n * crashedPrice * MAX_LTV * MYR_6) / (10n ** 18n * 100n);
      await loan.connect(liquidator).borrow(liquidatorMaxBorrow, 30n);

      expect(await loan.healthFactor(user.address)).to.be.lt(10n ** 18n);

      // Naive (unscaled) collateral value + bonus for repaying the full debt
      // — this is more ETH than the borrower actually deposited.
      const naiveCollateralValue = (principal * 10n ** 18n) / (crashedPrice * MYR_6);
      const naiveSeize = naiveCollateralValue + (naiveCollateralValue * 5n) / 100n;
      expect(naiveSeize).to.be.gt(ONE_ETH);

      await myr.connect(liquidator).approve(await loan.getAddress(), principal);
      const liquidatorMyrBefore = await myr.balanceOf(liquidator.address);
      const liquidatorEthBefore = await ethers.provider.getBalance(liquidator.address);

      const tx = await loan.connect(liquidator).liquidate(user.address, 0n, principal);
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;

      // All collateral seized (capped), but never more than what's there.
      expect(await loan.collateralOf(user.address)).to.equal(0n);

      // Liquidator received exactly the capped collateral, not the naive
      // (over-bonused) amount.
      const liquidatorEthAfter = await ethers.provider.getBalance(liquidator.address);
      expect(liquidatorEthAfter - liquidatorEthBefore + gasCost).to.equal(ONE_ETH);

      // Liquidator paid proportionally less MYR than the full debt, since
      // they only received 1 ETH worth (scaled), not naiveSeize worth.
      const liquidatorMyrAfter = await myr.balanceOf(liquidator.address);
      const myrPaid = liquidatorMyrBefore - liquidatorMyrAfter;
      expect(myrPaid).to.be.lt(principal);

      // The shortfall stays on the books as uncovered principal (bad debt)
      // rather than being wiped out for collateral the liquidator didn't
      // actually receive.
      const [loans] = await loan.getUserLoans(user.address);
      expect(loans[0].principal).to.be.gt(0n);
      expect(loans[0].active).to.be.true;
    });

    it("non-liquidator cannot liquidate", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await loan.connect(user).borrow(1_000n * MYR_6, 30n);
      await expect(
        loan.connect(other).liquidate(user.address, 0n, 1_000n * MYR_6)
      ).to.be.revertedWith("Not liquidator");
    });

    it("cannot liquidate a healthy, on-time position", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await loan.connect(user).borrow(1_000n * MYR_6, 30n);
      await expect(
        loan.connect(liquidator).liquidate(user.address, 0n, 1_000n * MYR_6)
      ).to.be.revertedWith("Not liquidatable");
    });
  });

  // ── Liquidation: scenario B — overdue past grace ──────────────────────────
  describe("liquidate — overdue loan (maturity + grace period)", () => {
    const principal = 1_000n * MYR_6;

    beforeEach(async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await loan.connect(user).borrow(principal, 30n);   // due in 30 days
      await topUp(liquidator, principal * 2n);
      await myr.connect(liquidator).approve(await loan.getAddress(), principal * 2n);
    });

    it("cannot liquidate before the due date", async () => {
      await time.increase(29 * DAY);
      await expect(
        loan.connect(liquidator).liquidate(user.address, 0n, principal)
      ).to.be.revertedWith("Not liquidatable");
    });

    it("cannot liquidate during the grace period", async () => {
      await time.increase(30 * DAY + GRACE - 3600);   // due + 6d23h — still in grace
      const [liquidatable, unhealthy, overdue] = await loan.isLoanLiquidatable(user.address, 0n);
      expect(liquidatable).to.be.false;
      expect(unhealthy).to.be.false;
      expect(overdue).to.be.false;
      await expect(
        loan.connect(liquidator).liquidate(user.address, 0n, principal)
      ).to.be.revertedWith("Not liquidatable");
    });

    it("liquidates once due date + grace period have passed, even with a healthy HF", async () => {
      await time.increase(30 * DAY + GRACE + 60);

      // The collateral is perfectly healthy — HF far above 1 — yet the loan
      // is liquidatable purely because it's overdue.
      expect(await loan.healthFactor(user.address)).to.be.gt(10n ** 18n);
      const [liquidatable, unhealthy, overdue] = await loan.isLoanLiquidatable(user.address, 0n);
      expect(liquidatable).to.be.true;
      expect(unhealthy).to.be.false;
      expect(overdue).to.be.true;

      await expect(
        loan.connect(liquidator).liquidate(user.address, 0n, principal * 2n)
      ).to.emit(loan, "LoanLiquidated");

      const [loans] = await loan.getUserLoans(user.address);
      expect(loans[0].active).to.be.false;
      // Only the debt's worth (+bonus) was seized — most of the 1 ETH remains.
      expect(await loan.collateralOf(user.address)).to.be.gt((ONE_ETH * 9n) / 10n);
    });

    it("an overdue loan does not make the account's OTHER loans liquidatable", async () => {
      await loan.connect(user).borrow(principal, 365n);   // loanId 1 — not due for a year
      await time.increase(30 * DAY + GRACE + 60);

      const [liq1] = await loan.isLoanLiquidatable(user.address, 1n);
      expect(liq1).to.be.false;
      await expect(
        loan.connect(liquidator).liquidate(user.address, 1n, principal)
      ).to.be.revertedWith("Not liquidatable");

      // The overdue one is.
      await expect(
        loan.connect(liquidator).liquidate(user.address, 0n, principal * 2n)
      ).to.emit(loan, "LoanLiquidated");
    });

    it("repaying during the grace period prevents liquidation", async () => {
      await time.increase(30 * DAY + 2 * DAY);   // 2 days into grace
      const due = await loan.loanDue(user.address, 0n);
      await topUp(user, due);
      await myr.connect(user).approve(await loan.getAddress(), due * 2n);
      await loan.connect(user).repay(0n, due * 2n);

      await time.increase(GRACE);
      await expect(
        loan.connect(liquidator).liquidate(user.address, 0n, principal)
      ).to.be.revertedWith("Loan not active");
    });

    it("getLoanInfo flags the account liquidatable when any loan is overdue", async () => {
      await time.increase(30 * DAY + GRACE + 60);
      const info = await loan.getLoanInfo(user.address);
      expect(info.isLiquidatable).to.be.true;
    });
  });

  // ── Protocol-side recovery (owner, no MYR) ────────────────────────────────
  describe("recoverLoan — owner settles a loan out of collateral", () => {
    const principal = 1_000n * MYR_6;

    beforeEach(async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await loan.connect(user).borrow(principal, 30n);
    });

    it("refuses a loan that is neither overdue nor underwater", async () => {
      await expect(
        loan.connect(owner).recoverLoan(user.address, 0n)
      ).to.be.revertedWith("Not recoverable");
    });

    it("is owner-only — a whitelisted liquidator cannot call it", async () => {
      await time.increase(30 * DAY + GRACE + 60);
      await expect(
        loan.connect(liquidator).recoverLoan(user.address, 0n)
      ).to.be.revertedWithCustomError(loan, "OwnableUnauthorizedAccount");
    });

    it("settles an overdue loan from collateral and charges the late penalty", async () => {
      await time.increase(30 * DAY + GRACE + 60);

      const debtBefore = await loan.loanDue(user.address, 0n);
      const [recoverable, unhealthy, overdue, quotedDebt, quotedPenalty, quotedSeize] =
        await loan.recoveryQuote(user.address, 0n);
      expect(recoverable).to.be.true;
      expect(unhealthy).to.be.false;      // 1 ETH backs only RM 1,000 of debt
      expect(overdue).to.be.true;
      // 5% default penalty on top of the debt.
      expect(quotedPenalty).to.equal((quotedDebt * 500n) / 10_000n);
      expect(quotedDebt).to.be.closeTo(debtBefore, MYR_6);

      const potBefore = await loan.collateralOf(user.address);
      await expect(loan.connect(owner).recoverLoan(user.address, 0n))
        .to.emit(loan, "LoanRecovered")
        .and.to.emit(loan, "LoanClosed");

      // Loan closed, debt gone, and only the debt + penalty worth of ETH taken.
      const [loans] = await loan.getUserLoans(user.address);
      expect(loans[0].active).to.be.false;
      expect(loans[0].principal).to.equal(0n);

      const seized = potBefore - (await loan.collateralOf(user.address));
      expect(seized).to.be.closeTo(quotedSeize, quotedSeize / 100n);
      // The pot was far bigger than the debt — the remainder stays the user's.
      expect(await loan.collateralOf(user.address)).to.be.gt((ONE_ETH * 8n) / 10n);
    });

    it("charges no penalty on the health-factor path", async () => {
      // Borrow near the cap, then crash the price so HF < 1 while the loan is
      // nowhere near its due date.
      await loan.connect(user).depositCollateral({ value: ONE_ETH * 9n });
      const [pot] = await loan.getPosition(user.address);
      const headroom = ((pot * ETH_PRICE * MAX_LTV * MYR_6) / (10n ** 18n * 100n)) - principal;
      await loan.connect(user).borrow(headroom, 365n);   // loanId 1

      // Walk the price down in <=20% steps (MAX_PRICE_CHANGE).
      let p = ETH_PRICE;
      for (let i = 0; i < 4; i++) {
        p = (p * 81n) / 100n;
        await loan.connect(owner).setEthPrice(p);
      }
      expect(await loan.healthFactor(user.address)).to.be.lt(10n ** 18n);

      const [recoverable, unhealthy, overdue, , penalty] =
        await loan.recoveryQuote(user.address, 1n);
      expect(recoverable).to.be.true;
      expect(unhealthy).to.be.true;
      expect(overdue).to.be.false;
      expect(penalty).to.equal(0n);       // misfortune, not delinquency

      await expect(loan.connect(owner).recoverLoan(user.address, 1n))
        .to.emit(loan, "LoanRecovered");
    });

    it("forwards the seized ETH to the owner and pulls no MYR from anyone", async () => {
      await time.increase(30 * DAY + GRACE + 60);
      const [, , , , , seizeWei] = await loan.recoveryQuote(user.address, 0n);

      const userMyrBefore  = await myr.balanceOf(user.address);
      const ownerMyrBefore = await myr.balanceOf(owner.address);
      const ownerEthBefore = await ethers.provider.getBalance(owner.address);

      const tx = await loan.connect(owner).recoverLoan(user.address, 0n);
      const receipt = await tx.wait();
      const gas = receipt!.gasUsed * receipt!.gasPrice;

      // Owner is up the seized ETH (net of gas). Nobody's MYR was touched —
      // the borrower keeps what they borrowed and no liquidator paid anything.
      expect(await ethers.provider.getBalance(owner.address))
        .to.be.closeTo(ownerEthBefore + seizeWei - gas, ethers.parseEther("0.0001"));
      expect(await myr.balanceOf(user.address)).to.equal(userMyrBefore);
      expect(await myr.balanceOf(owner.address)).to.equal(ownerMyrBefore);
    });

    it("books interest AND the late penalty into withdrawable protocol fees", async () => {
      await time.increase(30 * DAY + GRACE + 60);
      const [, , , , , , ] = await loan.recoveryQuote(user.address, 0n);
      const feesBefore = await loan.protocolFees();

      const receipt = await (await loan.connect(owner).recoverLoan(user.address, 0n)).wait();
      const evt = receipt!.logs
        .map(l => { try { return loan.interface.parseLog(l); } catch { return null; } })
        .find(p => p?.name === "LoanRecovered")!;
      const [, , , debtCovered, penaltyCharged] = evt.args;

      // Interest is whatever of the debt was not principal.
      const interestCovered = debtCovered - principal;
      expect(interestCovered).to.be.gt(0n);
      expect(penaltyCharged).to.be.gt(0n);

      // Both slices land in protocolFees...
      expect(await loan.protocolFees())
        .to.equal(feesBefore + interestCovered + penaltyCharged);

      // ...and the credit is genuinely backed, so the owner can actually sweep
      // it. An unbacked credit would revert here on the ERC-20 transfer.
      await expect(loan.connect(owner).withdrawProtocolFees(other.address))
        .to.emit(loan, "ProtocolFeesWithdrawn");
      expect(await myr.balanceOf(other.address))
        .to.equal(feesBefore + interestCovered + penaltyCharged);
      expect(await loan.protocolFees()).to.equal(0n);
    });

    it("credits interest but no penalty when recovered on the health path", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH * 9n });
      const [pot] = await loan.getPosition(user.address);
      const headroom = ((pot * ETH_PRICE * MAX_LTV * MYR_6) / (10n ** 18n * 100n)) - principal;
      await loan.connect(user).borrow(headroom, 365n);   // loanId 1
      let p = ETH_PRICE;
      for (let i = 0; i < 4; i++) {
        p = (p * 81n) / 100n;
        await loan.connect(owner).setEthPrice(p);
      }
      const feesBefore = await loan.protocolFees();

      const receipt = await (await loan.connect(owner).recoverLoan(user.address, 1n)).wait();
      const evt = receipt!.logs
        .map(l => { try { return loan.interface.parseLog(l); } catch { return null; } })
        .find(p2 => p2?.name === "LoanRecovered")!;
      const [, , , , penaltyCharged] = evt.args;

      expect(penaltyCharged).to.equal(0n);
      // Interest still earns — only the penalty is path-dependent.
      expect(await loan.protocolFees()).to.be.gte(feesBefore);
    });

    it("a pot too small to cover everything eats the penalty, not the borrower", async () => {
      // Crash the price until 1 ETH of collateral is worth less than the debt
      // (RM 1,000 + penalty), walking down in <=20% steps. 0.81^16 puts ETH
      // near RM 620, so the whole pot cannot cover even the principal.
      let p = ETH_PRICE;
      for (let i = 0; i < 16; i++) {
        p = (p * 81n) / 100n;
        await loan.connect(owner).setEthPrice(p);
      }
      await time.increase(30 * DAY + GRACE + 60);

      const potBefore = await loan.collateralOf(user.address);
      const debtBefore = await loan.loanDue(user.address, 0n);
      const receipt = await (await loan.connect(owner).recoverLoan(user.address, 0n)).wait();

      const evt = receipt!.logs
        .map(l => { try { return loan.interface.parseLog(l); } catch { return null; } })
        .find(p => p?.name === "LoanRecovered")!;
      const [, , seized, debtCovered, penaltyCharged] = evt.args;

      // Whole pot taken, every sen of it applied to the debt before any
      // penalty — the penalty is what goes unpaid, never the borrower's debt.
      expect(seized).to.equal(potBefore);
      expect(penaltyCharged).to.equal(0n);
      expect(debtCovered).to.be.lt(debtBefore);
      expect(await loan.collateralOf(user.address)).to.equal(0n);

      // Loan stays open for the shortfall rather than being written off.
      const [loans] = await loan.getUserLoans(user.address);
      expect(loans[0].active).to.be.true;
      expect(loans[0].principal).to.be.gt(0n);
    });

    it("setLatePenalty is owner-only and capped", async () => {
      await expect(
        loan.connect(user).setLatePenalty(100n)
      ).to.be.revertedWithCustomError(loan, "OwnableUnauthorizedAccount");
      await expect(
        loan.connect(owner).setLatePenalty(2_001n)
      ).to.be.revertedWith("Penalty exceeds cap");

      await expect(loan.connect(owner).setLatePenalty(1_000n))
        .to.emit(loan, "LatePenaltyUpdated").withArgs(500n, 1_000n);
      expect(await loan.latePenaltyBps()).to.equal(1_000n);
    });

    it("cannot be run twice on a loan it already closed", async () => {
      await time.increase(30 * DAY + GRACE + 60);
      await loan.connect(owner).recoverLoan(user.address, 0n);
      await expect(
        loan.connect(owner).recoverLoan(user.address, 0n)
      ).to.be.revertedWith("Loan not active");
    });
  });

  // ── Pause ─────────────────────────────────────────────────────────────────
  describe("Pausable", () => {
    it("owner can pause and unpause", async () => {
      await loan.connect(owner).pause();
      await expect(
        loan.connect(user).depositCollateral({ value: ONE_ETH })
      ).to.be.revertedWithCustomError(loan, "EnforcedPause");

      await loan.connect(owner).unpause();
      await expect(
        loan.connect(user).depositCollateral({ value: ONE_ETH })
      ).to.emit(loan, "CollateralDeposited");
    });
  });

  // ── Protocol Stats ────────────────────────────────────────────────────────
  describe("getProtocolStats", () => {
    it("returns zeroes initially", async () => {
      const [tb, tc, pf, price] = await loan.getProtocolStats();
      expect(tb).to.equal(0n);
      expect(tc).to.equal(0n);
      expect(pf).to.equal(0n);
      expect(price).to.equal(ETH_PRICE);
    });

    it("updates after borrow and deposit", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await loan.connect(user).borrow(5_000n * MYR_6, 30n);
      const [tb, tc] = await loan.getProtocolStats();
      expect(tb).to.equal(5_000n * MYR_6);
      expect(tc).to.equal(ONE_ETH);
    });
  });

  // ── Supply cap / utilization ──────────────────────────────────────────────
  describe("supplyCap / utilization", () => {
    it("initialises supplyCap to RM 100,000,000", async () => {
      expect(await loan.supplyCap()).to.equal(100_000_000n * MYR_6);
      expect(await loan.availableToBorrowPool()).to.equal(100_000_000n * MYR_6);
      expect(await loan.utilizationBps()).to.equal(0n);
    });

    it("reverts a borrow that would exceed the pool cap", async () => {
      await loan.connect(owner).setSupplyCap(1_000n * MYR_6);
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await expect(loan.connect(user).borrow(1_001n * MYR_6, 30n))
        .to.be.revertedWith("Pool cap reached");
      await expect(loan.connect(user).borrow(1_000n * MYR_6, 30n)).to.emit(loan, "Borrowed");
    });

    it("setSupplyCap cannot drop below outstanding debt", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await loan.connect(user).borrow(5_000n * MYR_6, 30n);
      await expect(loan.connect(owner).setSupplyCap(4_999n * MYR_6))
        .to.be.revertedWith("Cap below outstanding debt");
      await expect(loan.connect(owner).setSupplyCap(5_000n * MYR_6))
        .to.emit(loan, "SupplyCapUpdated");
    });

    it("setSupplyCap is owner-only", async () => {
      await expect(loan.connect(user).setSupplyCap(1n * MYR_6)).to.be.reverted;
    });

    it("currentAprBps = base + utilization slope, clamped at MAX_BASE_RATE_BPS", async () => {
      await loan.connect(owner).setSupplyCap(10_000n * MYR_6);
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await loan.connect(user).borrow(5_000n * MYR_6, 30n);      // 50% utilization

      expect(await loan.utilizationBps()).to.equal(5_000n);
      expect(await loan.utilPremiumBps()).to.equal(200n);        // UTIL_SLOPE_BPS * 0.5
      expect(await loan.currentAprBps()).to.equal(500n);         // 300 base + 200

      await loan.connect(owner).setBaseRate(1_400n);
      expect(await loan.currentAprBps()).to.equal(1_500n);       // clamped, not 1600
    });

    it("a loan keeps its locked APR even after the live rate moves", async () => {
      await loan.connect(owner).setSupplyCap(10_000n * MYR_6);
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await loan.connect(user).borrow(5_000n * MYR_6, 90n);
      const [loansBefore] = await loan.getUserLoans(user.address);
      const locked = loansBefore[0].aprBps;

      await loan.connect(owner).setBaseRate(1_400n);             // live rate jumps
      const [loansAfter] = await loan.getUserLoans(user.address);
      expect(loansAfter[0].aprBps).to.equal(locked);

      await time.increase(365 * DAY);
      const interest = await loan.accruedInterestForLoan(user.address, 0n);
      const expected = (5_000n * MYR_6 * locked) / 10_000n;      // NOT the new rate
      expect(interest).to.be.closeTo(expected, expected / 100n);
    });

    it("utilizationBps clamps at 100% when the cap is lowered onto the debt", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await loan.connect(user).borrow(5_000n * MYR_6, 30n);
      await loan.connect(owner).setSupplyCap(5_000n * MYR_6);
      expect(await loan.utilizationBps()).to.equal(10_000n);
      expect(await loan.availableToBorrowPool()).to.equal(0n);
      expect(await loan.utilPremiumBps()).to.equal(400n);        // the full slope
    });

    it("getPoolStats reports remaining capacity", async () => {
      await loan.connect(owner).setSupplyCap(10_000n * MYR_6);
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await loan.connect(user).borrow(4_000n * MYR_6, 30n);

      const [cap, borrowed, avail, util, premium, apr] = await loan.getPoolStats();
      expect(cap).to.equal(10_000n * MYR_6);
      expect(borrowed).to.equal(4_000n * MYR_6);
      expect(avail).to.equal(6_000n * MYR_6);
      expect(util).to.equal(4_000n);
      expect(premium).to.equal(160n);
      expect(apr).to.equal(await loan.currentAprBps());
    });
  });

  // ── Calendar-day accrual ──────────────────────────────────────────────────
  describe("calendar-day accrual (ACCRUAL_STEP)", () => {
    it("supply interest floors to whole days", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });

      expect(await loan.accruedSupplyInterest(user.address)).to.equal(0n);
      await time.increase(DAY / 2);
      expect(await loan.accruedSupplyInterest(user.address)).to.equal(0n);
      await time.increase(DAY / 2 + 60);                          // crosses 1 day
      expect(await loan.accruedSupplyInterest(user.address)).to.be.gt(0n);
    });

    it("borrow interest charges the borrow day itself (minimum one day before first repay)", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await loan.connect(user).borrow(5_000n * MYR_6, 30n);
      // Same block-day, no repay yet → the one-day floor applies.
      expect(await loan.accruedInterestForLoan(user.address, 0n)).to.be.gt(0n);
    });

    it("holds interest flat between day boundaries", async () => {
      // Accrual days are anchored to Malaysia midnight (UTC+8), not to the
      // borrow timestamp — pin the clock to just past a boundary first, so
      // the +1h probe below can't accidentally cross one.
      const TZ = 8 * 3600;
      const now = await time.latest();
      const nextMidnightMY = (Math.floor((now + TZ) / DAY) + 1) * DAY - TZ;
      await time.increaseTo(nextMidnightMY + 600);               // 00:10 MYT

      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await loan.connect(user).borrow(5_000n * MYR_6, 30n);
      await time.increase(2 * DAY);
      const at2d = await loan.accruedInterestForLoan(user.address, 0n);
      await time.increase(3600);                                 // 01:10 MYT — same day
      expect(await loan.accruedInterestForLoan(user.address, 0n)).to.equal(at2d);
      await time.increase(DAY);                                  // next day
      expect(await loan.accruedInterestForLoan(user.address, 0n)).to.be.gt(at2d);
    });
  });

  // ── getLoanInfo ────────────────────────────────────────────────────────────
  describe("getLoanInfo", () => {
    it("returns aggregate fields correctly", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await loan.connect(user).borrow(3_000n * MYR_6, 30n);
      await loan.connect(user).borrow(2_000n * MYR_6, 90n);

      const info = await loan.getLoanInfo(user.address);
      expect(info.collateral).to.equal(ONE_ETH);
      expect(info.borrowed).to.equal(5_000n * MYR_6);
      expect(info.isLiquidatable).to.be.false;
    });
  });

  // ── Ownership transfer (Ownable2Step) ─────────────────────────────────────
  describe("Ownable2Step", () => {
    it("requires two-step transfer", async () => {
      await loan.connect(owner).transferOwnership(other.address);
      // Not yet owner
      expect(await loan.owner()).to.equal(owner.address);
      // Other must accept
      await loan.connect(other).acceptOwnership();
      expect(await loan.owner()).to.equal(other.address);
    });
  });
});
