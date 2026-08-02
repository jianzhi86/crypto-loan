-- KYC no longer requires a wallet: identity verification is account-only, and
-- the wallet is attached later, when the user links one. The column stays as
-- the on-chain anchor (contract setKYC keys on an address) but may be null
-- until a wallet is linked.
ALTER TABLE "KycSubmission" ALTER COLUMN "wallet" DROP NOT NULL;
