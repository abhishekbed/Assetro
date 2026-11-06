-- Migration 007: Make KYC per-issuer 
-- Investor submits KYC to a specific issuer (identified by their user ID)
-- and optionally references the specific token they want to invest in.

-- Add issuer_id: which issuer this KYC submission is directed to
ALTER TABLE kyc_submissions
  ADD COLUMN IF NOT EXISTS issuer_id UUID NULL,
  ADD COLUMN IF NOT EXISTS token_id  UUID NULL;

-- One active submission per (investor, issuer) — not platform-wide
CREATE UNIQUE INDEX IF NOT EXISTS uq_kyc_user_issuer_active
  ON kyc_submissions (user_id, issuer_id)
  WHERE status IN ('pending', 'under_review');

CREATE INDEX IF NOT EXISTS idx_kyc_issuer ON kyc_submissions (issuer_id);
CREATE INDEX IF NOT EXISTS idx_kyc_token  ON kyc_submissions (token_id);
