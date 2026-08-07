import { ethers } from "hardhat";

/**
 * Advance the LOCAL Hardhat chain's clock — for demoing loan maturity and
 * overdue liquidation without waiting real months.
 *
 *   npx hardhat run scripts/time-travel.ts --network localhost            # +31 days
 *   DAYS=98 npx hardhat run scripts/time-travel.ts --network localhost   # +90d term + 7d grace + 1d
 *
 * After travelling past a loan's dueDate + 7-day grace period, the loan shows
 * as Liquidatable in the dashboard and liquidate() accepts it.
 *
 * NOTE: this moves block.timestamp AHEAD of wall-clock time. The web UI's
 * client-side interest mirror follows whichever clock is further along, so the
 * jump shows up in its figures on the next position refresh. Nothing on the
 * borrower's side is automatic though — see liquidate()'s onlyLiquidator:
 * travelling past dueDate + grace makes a loan ELIGIBLE, it does not seize
 * anything until a liquidator actually calls it.
 */
async function main() {
  const days = Number(process.env.DAYS ?? 31);
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error(`DAYS must be a positive number, got "${process.env.DAYS}"`);
  }
  const seconds = Math.round(days * 24 * 3600);

  const before = (await ethers.provider.getBlock("latest"))!.timestamp;
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
  const after = (await ethers.provider.getBlock("latest"))!.timestamp;

  console.log(`Chain clock advanced by ${days} day(s).`);
  console.log(`  before: ${new Date(before * 1000).toISOString()}`);
  console.log(`  after:  ${new Date(after * 1000).toISOString()}`);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
