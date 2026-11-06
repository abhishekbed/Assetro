-- Script: create-tenant-schema.sql
-- Description: Create a new tenant schema by slug
-- Usage: psql -v tenant_slug='my_tenant' -f create-tenant-schema.sql
--
-- Prerequisites:
--   - Migrations 001-005 must have been applied
--   - A tenant record should exist in public.tenants with the given slug
--
-- Example:
--   psql -h localhost -U assetro -d assetro_platform -v tenant_slug="'acme'" -f create-tenant-schema.sql

DO $$
DECLARE
    v_slug TEXT := :'tenant_slug';
    v_tenant_exists BOOLEAN;
BEGIN
    -- Validate the tenant exists in the tenants table
    SELECT EXISTS(
        SELECT 1 FROM public.tenants WHERE slug = v_slug
    ) INTO v_tenant_exists;

    IF NOT v_tenant_exists THEN
        RAISE EXCEPTION 'Tenant with slug "%" does not exist in public.tenants. Create the tenant record first.', v_slug;
    END IF;

    -- Check if schema already exists
    IF EXISTS (
        SELECT 1 FROM information_schema.schemata
        WHERE schema_name = 'tenant_' || v_slug
    ) THEN
        RAISE EXCEPTION 'Schema "tenant_%" already exists. Aborting to prevent data loss.', v_slug;
    END IF;

    -- Create the tenant schema
    PERFORM public.create_tenant_schema(v_slug);

    -- Apply performance indexes
    PERFORM public.create_tenant_performance_indexes(v_slug);

    RAISE NOTICE 'Successfully created schema and indexes for tenant "%".', v_slug;
END;
$$;
