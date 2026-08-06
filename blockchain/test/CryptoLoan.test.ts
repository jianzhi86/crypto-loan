import { expect } from "chai";
import { ethers } from "hardhat";
import { CryptoLoan, MockMYR } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const ETH_PRICE   = 18_000n;          // RM 18,000 per ETH
const ONE_ETH     = ethers.parseEther("1");
const MYR_6       = 1_000_000n;       // 1 MYR in 6-decimal units
const MAX_LTV     = 70n;
const LIQ_THRESH  = 80n;

async function approveAndRepay(
  myr: MockMYR,
  loan: CryptoLoan,
  signer: HardhatEthersSigner,
  amount: bigint
) {
  await myr.connect(signer).approve(await loan.getAddress(), amount);
  return loan.connect(signer).repay(amount);
}

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
        loan.connect(other).borrow(1000n * MYR_6)
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
      const info = await loan.loans(user.address);
      expect(info.collateral).to.equal(ONE_ETH);
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
      await loan.connect(user).borrow(borrow);

      // Trying to withdraw any collateral would push LTV over 70%
      await expect(
        loan.connect(user).withdrawCollateral(ONE_ETH / 2n)
      ).to.be.revertedWith("Would violate LTV");
    });

    it("reverts sending 0 ETH", async () => {
      await expect(
        loan.connect(user).depositCollateral({ value: 0n })
      ).to.be.revertedWith("Send ETH");
    });
  });

  // ── Borrow ────────────────────────────────────────────────────────────────
  describe("borrow", () => {
    beforeEach(async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
    });

    it("mints MYR up to max LTV", async () => {
      const maxBorrow = (ONE_ETH * ETH_PRICE * MAX_LTV * MYR_6) / (10n ** 18n * 100n);
      await expect(loan.connect(user).borrow(maxBorrow))
        .to.emit(loan, "Borrowed")
        .withArgs(user.address, maxBorrow, maxBorrow);
      expect(await myr.balanceOf(user.address)).to.equal(maxBorrow);
    });

    it("reverts if exceeds LTV", async () => {
      const tooMuch = (ONE_ETH * ETH_PRICE * MAX_LTV * MYR_6) / (10n ** 18n * 100n) + 1n;
      await expect(loan.connect(user).borrow(tooMuch)).to.be.revertedWith("Exceeds max LTV");
    });

    it("tracks totalBorrowed", async () => {
      const amt = 5_000n * MYR_6;
      await loan.connect(user).borrow(amt);
      expect(await loan.totalBorrowed()).to.equal(amt);
    });
  });

  // ── Repay ─────────────────────────────────────────────────────────────────
  describe("repay", () => {
    const borrowed = 5_000n * MYR_6;

    // Mint extra MYR to an account via owner acting as a proxy borrower
    async function topUp(to: HardhatEthersSigner, amount: bigint) {
      await loan.connect(owner).setKYC(owner.address, true);
      const ownerLoan = await loan.loans(owner.address);
      if (ownerLoan.collateral === 0n) {
        await loan.connect(owner).depositCollateral({ value: ONE_ETH * 10n });
      }
      await loan.connect(owner).borrow(amount);
      await myr.connect(owner).transfer(to.address, amount);
    }

    beforeEach(async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await loan.connect(user).borrow(borrowed);
    });

    it("repays principal in full, clears loan", async () => {
      // Pass 2x borrowed — contract caps to actual totalDue at execution time.
      // This ensures tiny inter-block interest doesn't leave a residual principal.
      const cap = borrowed * 2n;
      await topUp(user, borrowed); // ensure user has enough balance
      await myr.connect(user).approve(await loan.getAddress(), cap);
      await loan.connect(user).repay(cap);
      const info = await loan.loans(user.address);
      expect(info.principal).to.equal(0n);
      expect(info.startTime).to.equal(0n);
    });

    it("accrues interest over 1 year at the live variable rate", async () => {
      await time.increase(365 * 24 * 3600);
      const aprBps = await loan.currentAprBps();
      // Variable rate = 3% base + utilization/volatility premiums; must sit
      // inside the formula's designed band.
      expect(aprBps).to.be.gte(300n);
      expect(aprBps).to.be.lte(1000n);
      const interest = await loan.accruedInterest(user.address);
      const expected = (borrowed * aprBps) / 10_000n;
      expect(interest).to.be.closeTo(expected, expected / 100n);
    });

    it("repays interest + principal after 1 year", async () => {
      await time.increase(365 * 24 * 3600);
      const interest = await loan.accruedInterest(user.address);
      // topUp with interest + buffer; repay 2x so inter-block interest is covered
      await topUp(user, interest + borrowed);
      const cap = borrowed * 3n;
      await myr.connect(user).approve(await loan.getAddress(), cap);
      await loan.connect(user).repay(cap);
      const info = await loan.loans(user.address);
      expect(info.principal).to.equal(0n);
    });

    it("reverts if no active loan", async () => {
      // Clear the loan with a 2x cap, then confirm second repay reverts
      await topUp(user, borrowed);
      const cap = borrowed * 2n;
      await myr.connect(user).approve(await loan.getAddress(), cap);
      await loan.connect(user).repay(cap);
      await expect(loan.connect(user).repay(1n)).to.be.revertedWith("No active loan");
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
      await loan.connect(user).borrow(maxBorrow);

      const hf = await loan.healthFactor(user.address);
      const MIN_HEALTH = 10n ** 18n;
      expect(hf).to.be.gt(MIN_HEALTH);
    });

    it("currentLTV reflects borrow correctly", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      const half = (ONE_ETH * ETH_PRICE * 35n * MYR_6) / (10n ** 18n * 100n); // 35%
      await loan.connect(user).borrow(half);
      const ltv = await loan.currentLTV(user.address);
      expect(ltv).to.be.closeTo(35n, 1n);
    });
  });

  // ── Liquidation ───────────────────────────────────────────────────────────
  describe("liquidate", () => {
    it("liquidates an underwater position", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      const maxBorrowOld = (ONE_ETH * ETH_PRICE * MAX_LTV * MYR_6) / (10n ** 18n * 100n);
      await loan.connect(user).borrow(maxBorrowOld);

      // Drop price 20% — user's position is now undercollateralised
      const newPrice = (ETH_PRICE * 80n) / 100n;
      await loan.connect(owner).setEthPrice(newPrice);

      // Liquidator borrows at the NEW (lower) price so they don't exceed LTV
      await loan.connect(owner).setKYC(liquidator.address, true);
      await loan.connect(liquidator).depositCollateral({ value: ONE_ETH * 3n });
      const maxBorrowNew = (ONE_ETH * 3n * newPrice * MAX_LTV * MYR_6) / (10n ** 18n * 100n);
      await loan.connect(liquidator).borrow(maxBorrowNew);

      const hf = await loan.healthFactor(user.address);
      expect(hf).to.be.lt(10n ** 18n);

      const debtToCover = maxBorrowOld / 2n;
      await myr.connect(liquidator).approve(await loan.getAddress(), debtToCover);
      await expect(
        loan.connect(liquidator).liquidate(user.address, debtToCover)
      ).to.emit(loan, "Liquidated");
    });

    it("scales down the MYR pulled from the liquidator when collateral can't cover debt + bonus", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      const principal = (ONE_ETH * ETH_PRICE * MAX_LTV * MYR_6) / (10n ** 18n * 100n);
      await loan.connect(user).borrow(principal);

      // Crash the price hard enough that collateralValue + 5% bonus for the
      // full debt would exceed the 1 ETH actually deposited (two successive
      // 20%-max drops: 18000 -> 14400 -> 11520).
      await loan.connect(owner).setEthPrice((ETH_PRICE * 80n) / 100n);
      const crashedPrice = (((ETH_PRICE * 80n) / 100n) * 80n) / 100n;
      await loan.connect(owner).setEthPrice(crashedPrice);

      await loan.connect(owner).setKYC(liquidator.address, true);
      await loan.connect(liquidator).depositCollateral({ value: ONE_ETH * 3n });
      const liquidatorMaxBorrow = (ONE_ETH * 3n * crashedPrice * MAX_LTV * MYR_6) / (10n ** 18n * 100n);
      await loan.connect(liquidator).borrow(liquidatorMaxBorrow);

      expect(await loan.healthFactor(user.address)).to.be.lt(10n ** 18n);

      // Naive (unscaled) collateral value + bonus for repaying the full debt
      // — this is more ETH than the borrower actually deposited.
      const naiveCollateralValue = (principal * 10n ** 18n) / (crashedPrice * MYR_6);
      const naiveSeize = naiveCollateralValue + (naiveCollateralValue * 5n) / 100n;
      expect(naiveSeize).to.be.gt(ONE_ETH);

      await myr.connect(liquidator).approve(await loan.getAddress(), principal);
      const liquidatorMyrBefore = await myr.balanceOf(liquidator.address);
      const liquidatorEthBefore = await ethers.provider.getBalance(liquidator.address);

      const tx = await loan.connect(liquidator).liquidate(user.address, principal);
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;

      // All collateral seized (capped), but never more than what's there.
      const loanAfter = await loan.loans(user.address);
      expect(loanAfter.collateral).to.equal(0n);

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
      expect(loanAfter.principal).to.be.gt(0n);
    });

    it("non-liquidator cannot liquidate", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await loan.connect(user).borrow(1_000n * MYR_6);
      await expect(
        loan.connect(other).liquidate(user.address, 1_000n * MYR_6)
      ).to.be.revertedWith("Not liquidator");
    });

    it("cannot liquidate healthy position", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await loan.connect(user).borrow(1_000n * MYR_6);
      await expect(
        loan.connect(liquidator).liquidate(user.address, 1_000n * MYR_6)
      ).to.be.revertedWith("Not liquidatable");
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
      await loan.connect(user).borrow(5_000n * MYR_6);
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
      await expect(loan.connect(user).borrow(1_001n * MYR_6))
        .to.be.revertedWith("Pool cap reached");
      await expect(loan.connect(user).borrow(1_000n * MYR_6)).to.emit(loan, "Borrowed");
    });

    it("setSupplyCap cannot drop below outstanding debt", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await loan.connect(user).borrow(5_000n * MYR_6);
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
      await loan.connect(user).borrow(5_000n * MYR_6);          // 50% utilization

      expect(await loan.utilizationBps()).to.equal(5_000n);
      expect(await loan.utilPremiumBps()).to.equal(200n);        // UTIL_SLOPE_BPS * 0.5
      expect(await loan.currentAprBps()).to.equal(500n);         // 300 base + 200

      await loan.connect(owner).setBaseRate(1_400n);
      expect(await loan.currentAprBps()).to.equal(1_500n);       // clamped, not 1600
    });

    it("utilizationBps clamps at 100% when the cap is lowered onto the debt", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await loan.connect(user).borrow(5_000n * MYR_6);
      await loan.connect(owner).setSupplyCap(5_000n * MYR_6);
      expect(await loan.utilizationBps()).to.equal(10_000n);
      expect(await loan.availableToBorrowPool()).to.equal(0n);
      expect(await loan.utilPremiumBps()).to.equal(400n);        // the full slope
    });

    it("getPoolStats reports remaining capacity", async () => {
      await loan.connect(owner).setSupplyCap(10_000n * MYR_6);
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await loan.connect(user).borrow(4_000n * MYR_6);

      const [cap, borrowed, avail, util, premium, apr] = await loan.getPoolStats();
      expect(cap).to.equal(10_000n * MYR_6);
      expect(borrowed).to.equal(4_000n * MYR_6);
      expect(avail).to.equal(6_000n * MYR_6);
      expect(util).to.equal(4_000n);
      expect(premium).to.equal(160n);
      expect(apr).to.equal(await loan.currentAprBps());
    });
  });

  // ── Per-minute accrual ────────────────────────────────────────────────────
  describe("per-minute accrual (ACCRUAL_STEP)", () => {
    it("floors borrow interest to whole minutes", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await loan.connect(user).borrow(5_000n * MYR_6);

      expect(await loan.accruedInterest(user.address)).to.equal(0n);
      await time.increase(30);
      expect(await loan.accruedInterest(user.address)).to.equal(0n);
      await time.increase(31);                                   // crosses 60s
      expect(await loan.accruedInterest(user.address)).to.be.gt(0n);
    });

    it("floors supply interest to whole minutes", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });

      expect(await loan.accruedSupplyInterest(user.address)).to.equal(0n);
      await time.increase(30);
      expect(await loan.accruedSupplyInterest(user.address)).to.equal(0n);
      await time.increase(31);
      expect(await loan.accruedSupplyInterest(user.address)).to.be.gt(0n);
    });

    it("holds interest flat between minute boundaries", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await loan.connect(user).borrow(5_000n * MYR_6);
      await time.increase(120);
      const at2min = await loan.accruedInterest(user.address);
      await time.increase(30);                                   // still minute 2
      expect(await loan.accruedInterest(user.address)).to.equal(at2min);
      await time.increase(30);                                   // now minute 3
      expect(await loan.accruedInterest(user.address)).to.be.gt(at2min);
    });

    // The dust bug expressed on-chain: paying exactly totalDue() must clear the
    // principal to zero, not leave a few sen behind.
    it("repaying exactly totalDue() clears the principal to zero", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await loan.connect(user).borrow(5_000n * MYR_6);
      await time.increase(600);                                  // 10 minutes

      const due = await loan.totalDue(user.address);
      // Fund the interest portion from the owner, then repay the exact quote.
      await loan.connect(owner).setKYC(owner.address, true);
      await loan.connect(owner).depositCollateral({ value: ONE_ETH * 10n });
      await loan.connect(owner).borrow(1_000n * MYR_6);
      await myr.connect(owner).transfer(user.address, 1_000n * MYR_6);

      await myr.connect(user).approve(await loan.getAddress(), due);
      await loan.connect(user).repay(due);

      const info = await loan.loans(user.address);
      expect(info.principal).to.equal(0n);
      expect(info.startTime).to.equal(0n);
      expect(info.lastRepayTime).to.equal(0n);
    });
  });

  // ── getLoanInfo ────────────────────────────────────────────────────────────
  describe("getLoanInfo", () => {
    it("returns all fields correctly", async () => {
      await loan.connect(user).depositCollateral({ value: ONE_ETH });
      await loan.connect(user).borrow(5_000n * MYR_6);

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
