-- Drop the simulated bank-payout feature.
--
-- BankAccount held a user-entered Malaysian bank account and an on-chain
-- "recipient" address; BankTransfer held payout records whose PENDING →
-- PROCESSING → COMPLETED lifecycle was a setTimeout, not a payment rail. No
-- money ever moved through either table, so keeping them stored real bank
-- details in exchange for a fiction. Disbursement is now MYRC tokens only,
-- which is the part that actually settles on-chain.
--
-- Destructive and irreversible: the rows are not archived anywhere.
DROP TABLE IF EXISTS "BankTransfer";
DROP TABLE IF EXISTS "BankAccount";
