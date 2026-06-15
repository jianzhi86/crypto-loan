-- AlterTable: store which document type a KYC submission was verified against
-- ('ic' | 'passport' | 'license'). Defaults to 'ic' for existing rows.
ALTER TABLE "KycSubmission" ADD COLUMN IF NOT EXISTS "docType" TEXT NOT NULL DEFAULT 'ic';
