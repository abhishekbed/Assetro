-- Migration 011: Add blockchain sync fields so the DB correctly mirrors chain state.
-- Blockchain is the source of truth. These columns are written AFTER reading back
-- from the chain; they are NEVER derived from off-chain logic.

-- ── investor_claims ────────────────────────────────────────────────────────────
-- Store the actual bytes32 claimId returned by getClaimIdsByTopic(), plus the
-- on-chain verification results (signature check, issuer trust check).

ALTER TABLE investor_claims
  ADD COLUMN IF NOT EXISTS claim_id           VARCHAR(66)   NULL,
  ADD COLUMN IF NOT EXISTS signature_valid    BOOLEAN       NULL,
  ADD COLUMN IF NOT EXISTS issuer_trusted     BOOLEAN       NULL,
  ADD COLUMN IF NOT EXISTS chain_synced_at    TIMESTAMPTZ   NULL;

COMMENT ON COLUMN investor_claims.claim_id        IS 'bytes32 hex from getClaimIdsByTopic() — real on-chain claim identifier';
COMMENT ON COLUMN investor_claims.signature_valid IS 'true if stored signature recovers to CLAIM_ISSUER_ADDRESS';
COMMENT ON COLUMN investor_claims.issuer_trusted  IS 'true if CLAIM_ISSUER_ADDRESS is in TrustedIssuersRegistry';
COMMENT ON COLUMN investor_claims.chain_synced_at IS 'last time this row was verified by reading back from chain';

-- ── whitelists ────────────────────────────────────────────────────────────────
-- Mirror IdentityRegistry.isVerified(wallet), registerIdentity() tx hash,
-- the IR contract address, and the numeric country code.

ALTER TABLE whitelists
  ADD COLUMN IF NOT EXISTS verified_on_chain    BOOLEAN       NULL,
  ADD COLUMN IF NOT EXISTS verification_tx_hash VARCHAR(66)   NULL,
  ADD COLUMN IF NOT EXISTS ir_address           VARCHAR(42)   NULL,
  ADD COLUMN IF NOT EXISTS country_code         SMALLINT      NULL,
  ADD COLUMN IF NOT EXISTS chain_synced_at      TIMESTAMPTZ   NULL;

COMMENT ON COLUMN whitelists.verified_on_chain    IS 'IR.isVerified(wallet) — the authoritative on-chain whitelist status';
COMMENT ON COLUMN whitelists.verification_tx_hash IS 'tx hash from IdentityRegistry.registerIdentity()';
COMMENT ON COLUMN whitelists.ir_address           IS 'IdentityRegistry contract this wallet was registered in';
COMMENT ON COLUMN whitelists.country_code         IS 'numeric country code passed to registerIdentity() — mirrors IR.investorCountry()';
COMMENT ON COLUMN whitelists.chain_synced_at      IS 'last time IR.isVerified() was called and this row was refreshed';

-- ── onchain_identities ────────────────────────────────────────────────────────
-- Store the bytes32 claim IDs (topic → claimId) alongside the existing
-- claim_topics_issued (topic → txHash). Add sync-state tracking columns.

ALTER TABLE onchain_identities
  ADD COLUMN IF NOT EXISTS claim_ids       JSONB         DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sync_status     VARCHAR(20)   NULL,
  ADD COLUMN IF NOT EXISTS chain_synced_at TIMESTAMPTZ   NULL,
  ADD COLUMN IF NOT EXISTS sync_error      TEXT          NULL;

COMMENT ON COLUMN onchain_identities.claim_ids       IS 'topic => bytes32 claimId from getClaimIdsByTopic()';
COMMENT ON COLUMN onchain_identities.sync_status     IS 'synced | pending | stale | error';
COMMENT ON COLUMN onchain_identities.chain_synced_at IS 'last time this identity was verified by reading from chain';
COMMENT ON COLUMN onchain_identities.sync_error      IS 'last sync error message';
