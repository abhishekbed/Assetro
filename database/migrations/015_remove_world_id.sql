-- Remove fields used by the retired World ID issuer verification flow from
-- every existing tenant database schema.
DO $$
DECLARE
    s RECORD;
BEGIN
    FOR s IN
        SELECT schema_name
        FROM information_schema.schemata
        WHERE schema_name LIKE 'tenant_%'
        ORDER BY schema_name
    LOOP
        EXECUTE format(
            'ALTER TABLE %I.users DROP COLUMN IF EXISTS world_id_nullifier, DROP COLUMN IF EXISTS world_id_verified_at, DROP COLUMN IF EXISTS world_id_request_nonce, DROP COLUMN IF EXISTS world_id_request_expires_at',
            s.schema_name
        );
    END LOOP;
END
$$;
