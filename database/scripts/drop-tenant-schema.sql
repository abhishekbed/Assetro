-- Script: drop-tenant-schema.sql
-- Description: Drop a tenant schema with safety checks
-- Usage: psql -v tenant_slug='my_tenant' -v confirm='YES_I_AM_SURE' -f drop-tenant-schema.sql
--
-- WARNING: This is a destructive operation. All data in the tenant schema will be lost.
-- The confirm variable must be set to 'YES_I_AM_SURE' to proceed.
--
-- Example:
--   psql -h localhost -U assetro -d assetro_platform \
--     -v tenant_slug="'acme'" \
--     -v confirm="'YES_I_AM_SURE'" \
--     -f drop-tenant-schema.sql

DO $$
DECLARE
    v_slug TEXT := :'tenant_slug';
    v_confirm TEXT := :'confirm';
    v_schema_name TEXT;
    v_table_count INTEGER;
BEGIN
    v_schema_name := 'tenant_' || v_slug;

    -- Safety check: require explicit confirmation
    IF v_confirm IS NULL OR v_confirm != 'YES_I_AM_SURE' THEN
        RAISE EXCEPTION 'Safety check failed. Set confirm to ''YES_I_AM_SURE'' to proceed with dropping schema "%".', v_schema_name;
    END IF;

    -- Check if schema exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.schemata
        WHERE schema_name = v_schema_name
    ) THEN
        RAISE EXCEPTION 'Schema "%" does not exist.', v_schema_name;
    END IF;

    -- Log the tables that will be dropped
    SELECT COUNT(*)
    INTO v_table_count
    FROM information_schema.tables
    WHERE table_schema = v_schema_name;

    RAISE NOTICE 'Dropping schema "%" containing % tables...', v_schema_name, v_table_count;

    -- Drop the schema and all contained objects
    EXECUTE format('DROP SCHEMA %I CASCADE', v_schema_name);

    -- Optionally deactivate the tenant record (do not delete it for audit trail)
    UPDATE public.tenants
    SET status = 'inactive',
        updated_at = NOW()
    WHERE slug = v_slug;

    RAISE NOTICE 'Schema "%" has been dropped. Tenant "%" status set to inactive.', v_schema_name, v_slug;
END;
$$;
