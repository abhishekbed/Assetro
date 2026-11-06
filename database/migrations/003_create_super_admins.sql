-- Migration: 003_create_super_admins
-- Description: Create the public.super_admins table for platform-level administration
-- Author: Assetro Platform
-- Date: 2026-04-11

BEGIN;

CREATE TABLE IF NOT EXISTS public.super_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'super_admin'
        CHECK (role IN ('super_admin', 'support', 'readonly')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_super_admins_email ON public.super_admins (email);
CREATE INDEX idx_super_admins_is_active ON public.super_admins (is_active);

COMMIT;
