-- Migration 009: Add deployment_tx_hash column to onchain_identities
-- Stores the on-chain transaction hash from ONCHAINID contract deployment.

ALTER TABLE onchain_identities
  ADD COLUMN IF NOT EXISTS deployment_tx_hash VARCHAR(66) NULL;
