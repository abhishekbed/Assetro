-- 014_token_approval.sql
-- Platform-admin review of issuer token creation.
--
-- An issuer creates a token, it lands as 'pending_approval', and only an
-- approval lets them run deployTREXSuite from their own wallet.
-- New statuses: pending_approval | approved | rejected
-- (existing: draft | deploying | active | paused | retired)

ALTER TABLE tenant_demo.tokens
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_by      UUID,
    ADD COLUMN IF NOT EXISTS reviewed_at      TIMESTAMPTZ;

-- The admin queue reads "everything pending, newest first".
CREATE INDEX IF NOT EXISTS idx_tokens_status_created_at
    ON tenant_demo.tokens (status, created_at DESC);

-- Tokens created before this flow existed were deployable as 'draft', and
-- DEPLOYABLE_TOKEN_STATUSES still accepts 'draft' so they keep working.
-- Nothing to backfill.
