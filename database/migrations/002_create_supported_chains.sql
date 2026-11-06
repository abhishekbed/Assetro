-- Migration: 002_create_supported_chains
-- Description: Create the public.supported_chains table for blockchain network configuration
-- Author: Assetro Platform
-- Date: 2026-04-11

BEGIN;

CREATE TABLE IF NOT EXISTS public.supported_chains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    chain_id INTEGER NOT NULL UNIQUE,
    rpc_url TEXT NOT NULL,
    explorer_url TEXT,
    is_testnet BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    native_currency VARCHAR(10) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_supported_chains_chain_id ON public.supported_chains (chain_id);
CREATE INDEX idx_supported_chains_is_active ON public.supported_chains (is_active);

COMMIT;
