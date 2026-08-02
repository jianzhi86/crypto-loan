-- KYC belongs to the account, not the wallet.
--
-- 1. Normalize User.walletAddress to lowercase. wallet-login used to store the
--    checksummed address while wallet/link stored lowercase, so the same wallet
--    could sit on two accounts as case variants. Rows whose lowercase form is
--    already taken by another account are left as-is (resolve those by hand —
--    they are the duplicate-account bug this migration exists to prevent).
UPDATE "User" u
SET "walletAddress" = lower(u."walletAddress")
WHERE u."walletAddress" IS NOT NULL
  AND u."walletAddress" <> lower(u."walletAddress")
  AND NOT EXISTS (
    SELECT 1 FROM "User" v WHERE v."walletAddress" = lower(u."walletAddress")
  );

-- 2. Re-key KycSubmission by account.
ALTER TABLE "KycSubmission" ADD COLUMN "userId" TEXT;

UPDATE "KycSubmission" k
SET "userId" = u.id
FROM "User" u
WHERE lower(u."walletAddress") = k."wallet";

-- A submission whose wallet no account currently holds cannot be attributed to
-- anyone. It must not survive, or the next account to link that wallet would
-- inherit a stranger's identity documents and verification status.
DELETE FROM "KycSubmission" WHERE "userId" IS NULL;

ALTER TABLE "KycSubmission" ALTER COLUMN "userId" SET NOT NULL;

CREATE UNIQUE INDEX "KycSubmission_userId_key" ON "KycSubmission"("userId");

ALTER TABLE "KycSubmission"
  ADD CONSTRAINT "KycSubmission_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The wallet stays for on-chain anchoring and admin lookup, but is no longer
-- the identity key.
DROP INDEX "KycSubmission_wallet_key";
CREATE INDEX "KycSubmission_wallet_idx" ON "KycSubmission"("wallet");
