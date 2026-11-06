-- Local development only. Run after the API has created tenant_demo.users.
-- Uses the credentials shown in the local admin portal.
INSERT INTO tenant_demo.users (
  email, password_hash, name, role, is_email_verified, status, tenant_id
)
VALUES (
  'admin@assetro.com',
  crypt('Admin@12345', gen_salt('bf', 12)),
  'Platform Admin',
  'admin',
  true,
  'active',
  NULL
)
ON CONFLICT (email) DO NOTHING;
