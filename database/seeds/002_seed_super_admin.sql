-- Seed: 002_seed_super_admin
-- Description: Insert default super admin account
-- Author: Assetro Platform
-- Date: 2026-04-11
--
-- Password: Admin@123456
-- The bcrypt hash below was generated with cost factor 12.
-- IMPORTANT: Change this password immediately after first login in production.

BEGIN;

INSERT INTO public.super_admins (email, password_hash, name, role, is_active)
VALUES (
    'admin@assetro.com',
    '$2b$12$LJ3m4ys3Lk0TSwMCkVc3uO8mFGVOHzNGkYOJUQ1pFRWkMAjFX6Giy',
    'Platform Admin',
    'super_admin',
    true
)
ON CONFLICT (email) DO NOTHING;

COMMIT;
