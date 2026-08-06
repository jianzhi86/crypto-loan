/**
 * Close every OPEN BorrowPosition row. Run this after ANY contract redeploy.
 *
 * Why it is not optional: a redeploy resets the chain, so every on-chain
 * principal goes to zero, but these DB rows survive. The dashboard hides them
 * (its ledger short-circuits to empty when the chain principal is 0), so they
 * look gone — but they are still status:'OPEN', and the moment the user borrows
 * again the ledger maps ALL open rows and resurrects that phantom principal.
 * The repayment arithmetic then can never balance against the chain, which is
 * exactly the leftover-cents bug this ledger was fixed to avoid.
 *
 *   npx tsx scripts/reset-ledger.ts
 *
 * LoanTransaction is deliberately left alone — it is a historical record that
 * feeds the admin dashboard's lifetime analytics, not live state.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const open = await prisma.borrowPosition.count({ where: { status: 'OPEN' } });
  if (open === 0) {
    console.log('No OPEN borrow positions — nothing to reset.');
    return;
  }
  const res = await prisma.borrowPosition.updateMany({
    where: { status: 'OPEN' },
    data: { status: 'REPAID', repaidAt: new Date() },
  });
  console.log(`Closed ${res.count} OPEN borrow position(s).`);
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => void prisma.$disconnect());
