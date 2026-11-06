-- Seed: 003_seed_demo_tenant
-- Description: Create a demo tenant with schema for development and testing
-- Author: Assetro Platform
-- Date: 2026-04-11

BEGIN;

INSERT INTO public.tenants (name, slug, domain, status, plan, settings)
VALUES (
    'Demo Organization',
    'demo',
    'demo.assetro.localhost',
    'active',
    'professional',
    '{
        "features": {
            "kyc_enabled": true,
            "payments_enabled": true,
            "vesting_enabled": true,
            "corporate_actions_enabled": true
        },
        "limits": {
            "max_tokens": 10,
            "max_users": 1000
        }
    }'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- Create the tenant schema with all tables
SELECT public.create_tenant_schema('demo');

-- Apply performance indexes
SELECT public.create_tenant_performance_indexes('demo');

COMMIT;
