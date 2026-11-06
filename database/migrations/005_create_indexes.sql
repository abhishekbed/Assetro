-- Migration: 005_create_indexes
-- Description: Additional performance indexes (applied per tenant schema)
-- Author: Assetro Platform
-- Date: 2026-04-11
--
-- NOTE: These composite indexes supplement the per-table indexes created in
-- 004_create_tenant_schema_template. Run this function after creating a tenant
-- schema, or apply to existing tenants by calling:
--   SELECT public.create_tenant_performance_indexes('tenant_slug');

BEGIN;

CREATE OR REPLACE FUNCTION public.create_tenant_performance_indexes(tenant_slug TEXT)
RETURNS VOID AS $$
DECLARE
    schema_name TEXT;
BEGIN
    schema_name := 'tenant_' || tenant_slug;

    -- Composite index: transactions by token and date (for reporting queries)
    EXECUTE format('
        CREATE INDEX IF NOT EXISTS idx_%s_tx_token_created
        ON %I.transactions (token_id, created_at DESC)
    ', tenant_slug, schema_name);

    -- Composite index: transactions by status and date
    EXECUTE format('
        CREATE INDEX IF NOT EXISTS idx_%s_tx_status_created
        ON %I.transactions (status, created_at DESC)
    ', tenant_slug, schema_name);

    -- Composite index: whitelist by token and status (for compliance checks)
    EXECUTE format('
        CREATE INDEX IF NOT EXISTS idx_%s_whitelist_token_status
        ON %I.whitelist (token_id, status)
    ', tenant_slug, schema_name);

    -- Composite index: kyc_submissions by status and submitted date
    EXECUTE format('
        CREATE INDEX IF NOT EXISTS idx_%s_kyc_status_submitted
        ON %I.kyc_submissions (status, submitted_at DESC)
    ', tenant_slug, schema_name);

    -- Composite index: cap_table by token and balance (for top holder queries)
    EXECUTE format('
        CREATE INDEX IF NOT EXISTS idx_%s_cap_token_balance
        ON %I.cap_table (token_id, balance DESC)
    ', tenant_slug, schema_name);

    -- Composite index: payments by status and date
    EXECUTE format('
        CREATE INDEX IF NOT EXISTS idx_%s_payments_status_created
        ON %I.payments (status, created_at DESC)
    ', tenant_slug, schema_name);

    -- Partial index: active vesting schedules
    EXECUTE format('
        CREATE INDEX IF NOT EXISTS idx_%s_vesting_active
        ON %I.vesting_schedules (user_id, token_id)
        WHERE status = ''active''
    ', tenant_slug, schema_name);

    -- Partial index: pending KYC submissions
    EXECUTE format('
        CREATE INDEX IF NOT EXISTS idx_%s_kyc_pending
        ON %I.kyc_submissions (submitted_at DESC)
        WHERE status IN (''pending'', ''under_review'')
    ', tenant_slug, schema_name);

    RAISE NOTICE 'Performance indexes created for schema "tenant_%".', tenant_slug;
END;
$$ LANGUAGE plpgsql;

COMMIT;
