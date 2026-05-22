-- CreateTable
CREATE TABLE IF NOT EXISTS "KycSubmission" (
    "id"          SERIAL PRIMARY KEY,
    "wallet"      TEXT NOT NULL,
    "fullName"    TEXT NOT NULL,
    "icNumber"    TEXT NOT NULL,
    "dob"         TEXT NOT NULL,
    "gender"      TEXT NOT NULL,
    "nationality" TEXT NOT NULL,
    "phone"       TEXT NOT NULL,
    "email"       TEXT NOT NULL,
    "addr1"       TEXT NOT NULL,
    "addr2"       TEXT NOT NULL DEFAULT '',
    "postcode"    TEXT NOT NULL,
    "city"        TEXT NOT NULL,
    "state"       TEXT NOT NULL,
    "employment"  TEXT NOT NULL,
    "income"      TEXT NOT NULL,
    "purpose"     TEXT NOT NULL,
    "fundSource"  TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'pending',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "KycSubmission_wallet_key" ON "KycSubmission"("wallet");
