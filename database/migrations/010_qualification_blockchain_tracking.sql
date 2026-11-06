-- Migration 010: Add blockchain pipeline tracking columns to issuer_investor_qualifications
-- These columns track the async BullMQ job that runs the on-chain identity pipeline after approval.

ALTER TABLE issuer_investor_qualifications
  ADD COLUMN IF NOT EXISTS blockchain_job_id       VARCHAR(255)   NULL,
  ADD COLUMN IF NOT EXISTS blockchain_status        VARCHAR(100)   NULL,
  ADD COLUMN IF NOT EXISTS blockchain_error         TEXT           NULL,
  ADD COLUMN IF NOT EXISTS blockchain_completed_at  TIMESTAMPTZ    NULL;

COMMENT ON COLUMN issuer_investor_qualifications.blockchain_job_id       IS 'BullMQ job ID dispatched after issuer approval';
COMMENT ON COLUMN issuer_investor_qualifications.blockchain_status        IS 'queued | step:deploy_onchainid | step:issue_claims | step:register_identity | step:verify_whitelist | step:sync_db | completed | failed';
COMMENT ON COLUMN issuer_investor_qualifications.blockchain_error         IS 'Last error message from the blockchain pipeline';
COMMENT ON COLUMN issuer_investor_qualifications.blockchain_completed_at  IS 'When all blockchain steps completed successfully';
