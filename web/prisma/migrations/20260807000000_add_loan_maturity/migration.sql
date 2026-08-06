-- Per-loan on-chain model: each BorrowPosition row now maps 1:1 to an
-- on-chain loan (wallet, loanId) with a fixed due date.
ALTER TABLE "BorrowPosition" ADD COLUMN "loanId" INTEGER;
ALTER TABLE "BorrowPosition" ADD COLUMN "dueDate" TIMESTAMP(3);

CREATE INDEX "BorrowPosition_wallet_loanId_idx" ON "BorrowPosition"("wallet", "loanId");
