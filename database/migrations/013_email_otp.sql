-- 013_email_otp.sql
-- One-time email verification codes for investor signup and issuer applications.
--
-- Keyed by (email, purpose) rather than user id: the issuer-lead flow issues a
-- code before any user row exists. Only a SHA-256 hash of the code is stored.

CREATE TABLE IF NOT EXISTS tenant_demo.email_otps (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       VARCHAR(255) NOT NULL,
    purpose     VARCHAR(30)  NOT NULL,
    code_hash   VARCHAR(64)  NOT NULL,
    -- bcrypt hash of a password emailed alongside the code (issuer signup),
    -- applied to the account only once the code is confirmed.
    payload_hash VARCHAR(255),
    expires_at  TIMESTAMPTZ  NOT NULL,
    attempts    INT          NOT NULL DEFAULT 0,
    consumed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Lookup is always "latest code for this address and purpose".
CREATE INDEX IF NOT EXISTS idx_email_otps_email_purpose
    ON tenant_demo.email_otps (email, purpose);

-- Supports the expiry sweep in OtpService.purgeExpired().
CREATE INDEX IF NOT EXISTS idx_email_otps_expires_at
    ON tenant_demo.email_otps (expires_at);
