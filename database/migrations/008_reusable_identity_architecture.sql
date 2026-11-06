-- Migration 008: Reusable ONCHAINID + Issuer-specific qualification architecture
-- Implements: one ONCHAINID per investor, issuer-level qualification, token-level claim requirements

-- 1. Global investor KYC profile (submitted once, reused across all issuers)
CREATE TABLE IF NOT EXISTS investor_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL UNIQUE,
  full_name     VARCHAR(255) NOT NULL,
  date_of_birth DATE NOT NULL,
  nationality   VARCHAR(100) NOT NULL,
  country       VARCHAR(10) NOT NULL,
  address_line1 VARCHAR(500) NOT NULL,
  address_line2 VARCHAR(500),
  city          VARCHAR(100) NOT NULL,
  postal_code   VARCHAR(20) NOT NULL,
  investor_type VARCHAR(50) NOT NULL DEFAULT 'individual',
  accreditation VARCHAR(50) NOT NULL DEFAULT 'none',
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_investor_profiles_user_id ON investor_profiles(user_id);

-- 2. Add profile_id to kyc_documents (nullable — existing rows keep kyc_submission_id)
ALTER TABLE kyc_documents
  ALTER COLUMN kyc_submission_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES investor_profiles(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_kyc_documents_profile_id ON kyc_documents(profile_id);

-- 3. Issuer-specific investor qualification
--    One row per (issuer, investor) pair — reused across all of that issuer's tokens
CREATE TABLE IF NOT EXISTS issuer_investor_qualifications (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_id                 UUID NOT NULL,
  investor_id               UUID NOT NULL,
  profile_id                UUID NOT NULL REFERENCES investor_profiles(id) ON DELETE CASCADE,
  status                    VARCHAR(50) NOT NULL DEFAULT 'pending',
  reviewed_by               UUID,
  reviewed_at               TIMESTAMPTZ,
  approved_at               TIMESTAMPTZ,
  expires_at                TIMESTAMPTZ,
  claims_verified           JSONB NOT NULL DEFAULT '{}',
  additional_claims_required JSONB NOT NULL DEFAULT '[]',
  rejected_reason           TEXT,
  review_notes              TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_issuer_investor UNIQUE(issuer_id, investor_id)
);
CREATE INDEX IF NOT EXISTS idx_qualifications_issuer_id  ON issuer_investor_qualifications(issuer_id);
CREATE INDEX IF NOT EXISTS idx_qualifications_investor_id ON issuer_investor_qualifications(investor_id);
CREATE INDEX IF NOT EXISTS idx_qualifications_status      ON issuer_investor_qualifications(status);

-- 4. Token-specific required claims
--    Each token declares which claim topics an investor must have to be eligible
CREATE TABLE IF NOT EXISTS token_required_claims (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id    UUID NOT NULL,
  claim_topic INTEGER NOT NULL,
  claim_name  VARCHAR(100) NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_token_claim_topic UNIQUE(token_id, claim_topic)
);
CREATE INDEX IF NOT EXISTS idx_token_required_claims_token_id ON token_required_claims(token_id);

-- 5. Investor wallets (multi-wallet support per investor)
CREATE TABLE IF NOT EXISTS investor_wallets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id         UUID NOT NULL,
  address             VARCHAR(42) NOT NULL,
  type                VARCHAR(30) NOT NULL DEFAULT 'eoa',
  is_primary          BOOLEAN NOT NULL DEFAULT false,
  is_verified         BOOLEAN NOT NULL DEFAULT false,
  verified_at_nonce   VARCHAR(255),
  verified_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_investor_wallet UNIQUE(investor_id, address)
);
CREATE INDEX IF NOT EXISTS idx_investor_wallets_investor_id ON investor_wallets(investor_id);
CREATE INDEX IF NOT EXISTS idx_investor_wallets_address     ON investor_wallets(address);

-- 6. Investor claims (DB mirror of on-chain claims — blockchain is source of truth)
CREATE TABLE IF NOT EXISTS investor_claims (
  id                VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  investor_id       UUID NOT NULL,
  identity_contract VARCHAR(42) NOT NULL,
  claim_topic       INTEGER NOT NULL,
  claim_topic_name  VARCHAR(100) NOT NULL,
  issuer_address    VARCHAR(255) NOT NULL,
  claim_data        TEXT,
  tx_hash           VARCHAR(66),
  chain_id          INTEGER NOT NULL,
  status            VARCHAR(30) NOT NULL DEFAULT 'active',
  issued_at         TIMESTAMPTZ NOT NULL,
  expires_at        TIMESTAMPTZ,
  revoked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_investor_claim UNIQUE(investor_id, claim_topic)
);
CREATE INDEX IF NOT EXISTS idx_investor_claims_investor_id ON investor_claims(investor_id);
CREATE INDEX IF NOT EXISTS idx_investor_claims_status      ON investor_claims(status);

-- Claim topic reference:
--   1 = KYC_APPROVED
--   2 = COUNTRY_OF_RESIDENCE
--   3 = INVESTOR_CLASSIFICATION
--   4 = ACCREDITED_STATUS
