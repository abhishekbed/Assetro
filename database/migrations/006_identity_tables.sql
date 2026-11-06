-- Migration: 006_identity_tables
-- Description: Add ONCHAINID identity layer tables and columns required for
--              Phase 1 — ERC-3643 investor identity & KYC claim pipeline.
-- Author: Assetro Platform
-- Date: 2026-05-26
--
-- Changes:
--   1. users          — add identity_contract_address (investor's ONCHAINID contract)
--   2. tokens         — add claim_issuer_address + full T-REX suite addresses
--   3. onchain_identities (new) — tracks deployed ONCHAINID per user per chain
--   4. Recreate create_tenant_schema() to include all new columns and table
--      so future tenants automatically get the full schema.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Apply changes to ALL existing tenant schemas
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    s RECORD;
    schema_slug TEXT;
BEGIN
    FOR s IN
        SELECT schema_name
        FROM information_schema.schemata
        WHERE schema_name LIKE 'tenant_%'
        ORDER BY schema_name
    LOOP
        schema_slug := replace(s.schema_name, 'tenant_', '');
        RAISE NOTICE 'Applying identity migration to schema: %', s.schema_name;

        -- ── users: identity_contract_address ──────────────────────────────
        EXECUTE format(
            'ALTER TABLE %I.users ADD COLUMN IF NOT EXISTS identity_contract_address VARCHAR(42)',
            s.schema_name
        );
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS idx_%s_users_identity ON %I.users (identity_contract_address)',
            schema_slug, s.schema_name
        );

        -- ── tokens: T-REX suite addresses + claim_issuer_address ─────────
        -- The full suite is deployed per-token by TREXGateway.
        EXECUTE format(
            'ALTER TABLE %I.tokens ADD COLUMN IF NOT EXISTS claim_issuer_address VARCHAR(42)',
            s.schema_name
        );
        EXECUTE format(
            'ALTER TABLE %I.tokens ADD COLUMN IF NOT EXISTS identity_registry_address VARCHAR(42)',
            s.schema_name
        );
        EXECUTE format(
            'ALTER TABLE %I.tokens ADD COLUMN IF NOT EXISTS identity_registry_storage_address VARCHAR(42)',
            s.schema_name
        );
        EXECUTE format(
            'ALTER TABLE %I.tokens ADD COLUMN IF NOT EXISTS claim_topics_registry_address VARCHAR(42)',
            s.schema_name
        );
        EXECUTE format(
            'ALTER TABLE %I.tokens ADD COLUMN IF NOT EXISTS trusted_issuers_registry_address VARCHAR(42)',
            s.schema_name
        );
        EXECUTE format(
            'ALTER TABLE %I.tokens ADD COLUMN IF NOT EXISTS modular_compliance_address VARCHAR(42)',
            s.schema_name
        );

        -- ── onchain_identities (new table) ────────────────────────────────
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS %I.onchain_identities (
                id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id                 UUID NOT NULL,
                identity_contract_address VARCHAR(42) NOT NULL,
                chain_id                INTEGER NOT NULL
                    REFERENCES public.supported_chains(chain_id),
                claim_topics_issued     JSONB NOT NULL DEFAULT ''{}''::JSONB,
                registered_token_ids    JSONB NOT NULL DEFAULT ''[]''::JSONB,
                deployed_at             TIMESTAMPTZ,
                created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT uq_%s_onchain_identity_user_chain
                    UNIQUE(user_id, chain_id)
            )
        ', s.schema_name, schema_slug);

        -- Foreign key: onchain_identities → users
        EXECUTE format('
            DO $inner$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.table_constraints
                    WHERE table_schema = %L
                      AND table_name   = ''onchain_identities''
                      AND constraint_name = ''fk_%s_identity_user''
                ) THEN
                    ALTER TABLE %I.onchain_identities
                        ADD CONSTRAINT fk_%s_identity_user
                        FOREIGN KEY (user_id) REFERENCES %I.users(id);
                END IF;
            END
            $inner$
        ', s.schema_name, schema_slug, s.schema_name, schema_slug, s.schema_name);

        -- Indexes for onchain_identities
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS idx_%s_oid_user ON %I.onchain_identities (user_id)',
            schema_slug, s.schema_name
        );
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS idx_%s_oid_address ON %I.onchain_identities (identity_contract_address)',
            schema_slug, s.schema_name
        );
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS idx_%s_oid_chain ON %I.onchain_identities (chain_id)',
            schema_slug, s.schema_name
        );

        -- Update trigger for onchain_identities
        EXECUTE format('
            DO $inner$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.triggers
                    WHERE trigger_schema = %L
                      AND trigger_name = ''trigger_%s_oid_updated_at''
                ) THEN
                    CREATE TRIGGER trigger_%s_oid_updated_at
                        BEFORE UPDATE ON %I.onchain_identities
                        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
                END IF;
            END
            $inner$
        ', s.schema_name, schema_slug, schema_slug, s.schema_name);

        RAISE NOTICE 'Done: %', s.schema_name;
    END LOOP;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: Recreate create_tenant_schema() to include all new columns + table
--         so NEW tenants automatically get the complete schema.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_tenant_schema(tenant_slug TEXT)
RETURNS VOID AS $$
DECLARE
    schema_name TEXT;
BEGIN
    schema_name := 'tenant_' || tenant_slug;

    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', schema_name);

    ---------------------------------------------------------------------------
    -- users
    ---------------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.users (
            id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email                       VARCHAR(255) NOT NULL UNIQUE,
            password_hash               VARCHAR(255) NOT NULL,
            name                        VARCHAR(255) NOT NULL,
            role                        VARCHAR(50) NOT NULL DEFAULT ''investor''
                CHECK (role IN (''admin'', ''compliance_officer'', ''issuer'', ''investor'', ''viewer'')),
            wallet_address              VARCHAR(42),
            identity_contract_address   VARCHAR(42),
            is_active                   BOOLEAN NOT NULL DEFAULT true,
            is_email_verified           BOOLEAN NOT NULL DEFAULT false,
            phone                       VARCHAR(20),
            avatar_url                  TEXT,
            metadata                    JSONB NOT NULL DEFAULT ''{}'',
            last_login_at               TIMESTAMPTZ,
            created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    ', schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_users_email    ON %I.users (email)',                     tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_users_role     ON %I.users (role)',                      tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_users_wallet   ON %I.users (wallet_address)',            tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_users_identity ON %I.users (identity_contract_address)', tenant_slug, schema_name);

    ---------------------------------------------------------------------------
    -- tokens  (includes full T-REX suite addresses)
    ---------------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.tokens (
            id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name                            VARCHAR(255) NOT NULL,
            symbol                          VARCHAR(20) NOT NULL,
            token_type                      VARCHAR(50) NOT NULL DEFAULT ''equity''
                CHECK (token_type IN (''equity'', ''debt'', ''real_estate'', ''fund'', ''commodity'', ''custom'')),
            total_supply                    NUMERIC(78, 0) NOT NULL DEFAULT 0,
            decimals                        INTEGER NOT NULL DEFAULT 18,
            contract_address                VARCHAR(42),
            chain_id                        INTEGER NOT NULL REFERENCES public.supported_chains(chain_id),
            status                          VARCHAR(30) NOT NULL DEFAULT ''draft''
                CHECK (status IN (''draft'', ''pending_deployment'', ''deployed'', ''paused'', ''retired'')),
            issuer_id                       UUID NOT NULL,
            description                     TEXT,
            metadata                        JSONB NOT NULL DEFAULT ''{}'',
            deployment_tx_hash              VARCHAR(66),
            deployed_at                     TIMESTAMPTZ,
            -- T-REX suite addresses (populated after deployTREXSuite)
            claim_issuer_address            VARCHAR(42),
            identity_registry_address       VARCHAR(42),
            identity_registry_storage_address VARCHAR(42),
            claim_topics_registry_address   VARCHAR(42),
            trusted_issuers_registry_address VARCHAR(42),
            modular_compliance_address      VARCHAR(42),
            created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    ', schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tokens_symbol   ON %I.tokens (symbol)',           tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tokens_status   ON %I.tokens (status)',           tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tokens_chain    ON %I.tokens (chain_id)',         tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tokens_contract ON %I.tokens (contract_address)', tenant_slug, schema_name);

    ---------------------------------------------------------------------------
    -- onchain_identities  (one row per investor per chain)
    ---------------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.onchain_identities (
            id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id                     UUID NOT NULL,
            identity_contract_address   VARCHAR(42) NOT NULL,
            chain_id                    INTEGER NOT NULL
                REFERENCES public.supported_chains(chain_id),
            -- JSONB map of claim topic → { issued_at, tx_hash, value }
            claim_topics_issued         JSONB NOT NULL DEFAULT ''{}''::JSONB,
            -- JSONB array of token IDs where this identity is registered in IR
            registered_token_ids        JSONB NOT NULL DEFAULT ''[]''::JSONB,
            deployed_at                 TIMESTAMPTZ,
            created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_%s_onchain_identity_user_chain UNIQUE(user_id, chain_id)
        )
    ', schema_name, tenant_slug);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_oid_user    ON %I.onchain_identities (user_id)',                   tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_oid_address ON %I.onchain_identities (identity_contract_address)', tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_oid_chain   ON %I.onchain_identities (chain_id)',                  tenant_slug, schema_name);

    ---------------------------------------------------------------------------
    -- compliance_rules
    ---------------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.compliance_rules (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            token_id    UUID NOT NULL,
            rule_type   VARCHAR(100) NOT NULL
                CHECK (rule_type IN (
                    ''max_investors'', ''min_investment'', ''max_investment'',
                    ''accredited_only'', ''country_whitelist'', ''country_blacklist'',
                    ''lock_up_period'', ''transfer_restriction'', ''custom''
                )),
            parameters  JSONB NOT NULL DEFAULT ''{}'',
            is_active   BOOLEAN NOT NULL DEFAULT true,
            description TEXT,
            created_by  UUID NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    ', schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_compliance_token ON %I.compliance_rules (token_id)',  tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_compliance_type  ON %I.compliance_rules (rule_type)', tenant_slug, schema_name);

    ---------------------------------------------------------------------------
    -- kyc_submissions
    ---------------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.kyc_submissions (
            id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id                 UUID NOT NULL,
            status                  VARCHAR(30) NOT NULL DEFAULT ''pending''
                CHECK (status IN (''pending'', ''under_review'', ''approved'', ''rejected'', ''expired'')),
            level                   VARCHAR(20) NOT NULL DEFAULT ''basic''
                CHECK (level IN (''basic'', ''standard'', ''enhanced'')),
            first_name              VARCHAR(255),
            last_name               VARCHAR(255),
            date_of_birth           DATE,
            nationality             VARCHAR(3),
            country_of_residence    VARCHAR(3),
            address_line1           TEXT,
            address_line2           TEXT,
            city                    VARCHAR(255),
            state                   VARCHAR(255),
            postal_code             VARCHAR(20),
            tax_id                  VARCHAR(100),
            is_accredited           BOOLEAN DEFAULT false,
            investor_type           VARCHAR(30) DEFAULT ''retail''
                CHECK (investor_type IN (''retail'', ''accredited'', ''institutional'')),
            risk_score              INTEGER,
            reviewer_id             UUID,
            reviewer_notes          TEXT,
            submitted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            reviewed_at             TIMESTAMPTZ,
            expires_at              TIMESTAMPTZ,
            created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    ', schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_kyc_user   ON %I.kyc_submissions (user_id)', tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_kyc_status ON %I.kyc_submissions (status)',  tenant_slug, schema_name);

    ---------------------------------------------------------------------------
    -- kyc_documents
    ---------------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.kyc_documents (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            kyc_submission_id   UUID NOT NULL,
            document_type       VARCHAR(50) NOT NULL
                CHECK (document_type IN (
                    ''passport'', ''national_id'', ''drivers_license'',
                    ''proof_of_address'', ''bank_statement'', ''tax_return'',
                    ''accreditation_letter'', ''selfie'', ''other''
                )),
            file_key            TEXT NOT NULL,
            file_name           VARCHAR(255) NOT NULL,
            file_size           INTEGER NOT NULL,
            mime_type           VARCHAR(100) NOT NULL,
            status              VARCHAR(20) NOT NULL DEFAULT ''uploaded''
                CHECK (status IN (''uploaded'', ''verified'', ''rejected'')),
            uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    ', schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_kycdocs_submission ON %I.kyc_documents (kyc_submission_id)', tenant_slug, schema_name);

    ---------------------------------------------------------------------------
    -- whitelist
    ---------------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.whitelist (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            token_id        UUID NOT NULL,
            user_id         UUID NOT NULL,
            wallet_address  VARCHAR(42) NOT NULL,
            status          VARCHAR(20) NOT NULL DEFAULT ''pending''
                CHECK (status IN (''pending'', ''approved'', ''rejected'', ''revoked'')),
            approved_by     UUID,
            approved_at     TIMESTAMPTZ,
            revoked_at      TIMESTAMPTZ,
            notes           TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(token_id, wallet_address)
        )
    ', schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_whitelist_token  ON %I.whitelist (token_id)',       tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_whitelist_user   ON %I.whitelist (user_id)',        tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_whitelist_wallet ON %I.whitelist (wallet_address)', tenant_slug, schema_name);

    ---------------------------------------------------------------------------
    -- cap_table
    ---------------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.cap_table (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            token_id        UUID NOT NULL,
            user_id         UUID NOT NULL,
            wallet_address  VARCHAR(42) NOT NULL,
            balance         NUMERIC(78, 0) NOT NULL DEFAULT 0,
            locked_balance  NUMERIC(78, 0) NOT NULL DEFAULT 0,
            percentage      NUMERIC(10, 6) NOT NULL DEFAULT 0,
            last_transfer_at TIMESTAMPTZ,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(token_id, wallet_address)
        )
    ', schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_cap_token ON %I.cap_table (token_id)', tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_cap_user  ON %I.cap_table (user_id)',  tenant_slug, schema_name);

    ---------------------------------------------------------------------------
    -- transactions
    ---------------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.transactions (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            token_id        UUID NOT NULL,
            tx_type         VARCHAR(30) NOT NULL
                CHECK (tx_type IN (''mint'', ''burn'', ''transfer'', ''freeze'', ''unfreeze'', ''force_transfer'', ''dividend'')),
            from_address    VARCHAR(42),
            to_address      VARCHAR(42),
            amount          NUMERIC(78, 0) NOT NULL,
            tx_hash         VARCHAR(66),
            chain_id        INTEGER NOT NULL,
            block_number    BIGINT,
            status          VARCHAR(20) NOT NULL DEFAULT ''pending''
                CHECK (status IN (''pending'', ''submitted'', ''confirmed'', ''failed'', ''reverted'')),
            gas_used        NUMERIC(78, 0),
            gas_price       NUMERIC(78, 0),
            initiated_by    UUID NOT NULL,
            error_message   TEXT,
            metadata        JSONB NOT NULL DEFAULT ''{}'',
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            confirmed_at    TIMESTAMPTZ
        )
    ', schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tx_token  ON %I.transactions (token_id)',    tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tx_hash   ON %I.transactions (tx_hash)',     tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tx_status ON %I.transactions (status)',      tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tx_from   ON %I.transactions (from_address)', tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tx_to     ON %I.transactions (to_address)',   tenant_slug, schema_name);

    ---------------------------------------------------------------------------
    -- payments
    ---------------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.payments (
            id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id                     UUID NOT NULL,
            token_id                    UUID NOT NULL,
            amount                      NUMERIC(18, 2) NOT NULL,
            currency                    VARCHAR(10) NOT NULL DEFAULT ''USD'',
            payment_method              VARCHAR(30) NOT NULL
                CHECK (payment_method IN (''stripe'', ''wire_transfer'', ''crypto'', ''ach'')),
            status                      VARCHAR(20) NOT NULL DEFAULT ''pending''
                CHECK (status IN (''pending'', ''processing'', ''completed'', ''failed'', ''refunded'')),
            stripe_payment_intent_id    VARCHAR(255),
            stripe_charge_id            VARCHAR(255),
            reference_number            VARCHAR(255),
            tokens_allocated            NUMERIC(78, 0) NOT NULL DEFAULT 0,
            metadata                    JSONB NOT NULL DEFAULT ''{}'',
            created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    ', schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_payments_user   ON %I.payments (user_id)',   tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_payments_token  ON %I.payments (token_id)',  tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_payments_status ON %I.payments (status)',    tenant_slug, schema_name);

    ---------------------------------------------------------------------------
    -- corporate_actions
    ---------------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.corporate_actions (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            token_id        UUID NOT NULL,
            action_type     VARCHAR(30) NOT NULL
                CHECK (action_type IN (''dividend'', ''stock_split'', ''buyback'', ''rights_issue'', ''voting'', ''custom'')),
            title           VARCHAR(255) NOT NULL,
            description     TEXT,
            status          VARCHAR(20) NOT NULL DEFAULT ''draft''
                CHECK (status IN (''draft'', ''scheduled'', ''in_progress'', ''completed'', ''cancelled'')),
            parameters      JSONB NOT NULL DEFAULT ''{}'',
            record_date     TIMESTAMPTZ,
            execution_date  TIMESTAMPTZ,
            created_by      UUID NOT NULL,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    ', schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_corpactions_token  ON %I.corporate_actions (token_id)', tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_corpactions_status ON %I.corporate_actions (status)',   tenant_slug, schema_name);

    ---------------------------------------------------------------------------
    -- vesting_schedules
    ---------------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.vesting_schedules (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            token_id            UUID NOT NULL,
            user_id             UUID NOT NULL,
            total_amount        NUMERIC(78, 0) NOT NULL,
            released_amount     NUMERIC(78, 0) NOT NULL DEFAULT 0,
            start_date          TIMESTAMPTZ NOT NULL,
            end_date            TIMESTAMPTZ NOT NULL,
            cliff_date          TIMESTAMPTZ,
            vesting_interval    VARCHAR(20) NOT NULL DEFAULT ''monthly''
                CHECK (vesting_interval IN (''daily'', ''weekly'', ''monthly'', ''quarterly'', ''yearly'', ''custom'')),
            status              VARCHAR(20) NOT NULL DEFAULT ''active''
                CHECK (status IN (''active'', ''paused'', ''completed'', ''cancelled'')),
            schedule_data       JSONB NOT NULL DEFAULT ''[]'',
            created_by          UUID NOT NULL,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    ', schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_vesting_token  ON %I.vesting_schedules (token_id)', tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_vesting_user   ON %I.vesting_schedules (user_id)',  tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_vesting_status ON %I.vesting_schedules (status)',   tenant_slug, schema_name);

    ---------------------------------------------------------------------------
    -- Foreign key constraints
    ---------------------------------------------------------------------------
    EXECUTE format('ALTER TABLE %I.tokens             ADD CONSTRAINT fk_%s_tokens_issuer        FOREIGN KEY (issuer_id)           REFERENCES %I.users(id)',            schema_name, tenant_slug, schema_name);
    EXECUTE format('ALTER TABLE %I.onchain_identities ADD CONSTRAINT fk_%s_identity_user        FOREIGN KEY (user_id)             REFERENCES %I.users(id)',            schema_name, tenant_slug, schema_name);
    EXECUTE format('ALTER TABLE %I.compliance_rules   ADD CONSTRAINT fk_%s_compliance_token     FOREIGN KEY (token_id)            REFERENCES %I.tokens(id)',           schema_name, tenant_slug, schema_name);
    EXECUTE format('ALTER TABLE %I.compliance_rules   ADD CONSTRAINT fk_%s_compliance_creator   FOREIGN KEY (created_by)          REFERENCES %I.users(id)',            schema_name, tenant_slug, schema_name);
    EXECUTE format('ALTER TABLE %I.kyc_submissions    ADD CONSTRAINT fk_%s_kyc_user             FOREIGN KEY (user_id)             REFERENCES %I.users(id)',            schema_name, tenant_slug, schema_name);
    EXECUTE format('ALTER TABLE %I.kyc_documents      ADD CONSTRAINT fk_%s_kycdoc_submission    FOREIGN KEY (kyc_submission_id)   REFERENCES %I.kyc_submissions(id)',  schema_name, tenant_slug, schema_name);
    EXECUTE format('ALTER TABLE %I.whitelist          ADD CONSTRAINT fk_%s_whitelist_token      FOREIGN KEY (token_id)            REFERENCES %I.tokens(id)',           schema_name, tenant_slug, schema_name);
    EXECUTE format('ALTER TABLE %I.whitelist          ADD CONSTRAINT fk_%s_whitelist_user       FOREIGN KEY (user_id)             REFERENCES %I.users(id)',            schema_name, tenant_slug, schema_name);
    EXECUTE format('ALTER TABLE %I.cap_table          ADD CONSTRAINT fk_%s_cap_token            FOREIGN KEY (token_id)            REFERENCES %I.tokens(id)',           schema_name, tenant_slug, schema_name);
    EXECUTE format('ALTER TABLE %I.cap_table          ADD CONSTRAINT fk_%s_cap_user             FOREIGN KEY (user_id)             REFERENCES %I.users(id)',            schema_name, tenant_slug, schema_name);
    EXECUTE format('ALTER TABLE %I.transactions       ADD CONSTRAINT fk_%s_tx_token             FOREIGN KEY (token_id)            REFERENCES %I.tokens(id)',           schema_name, tenant_slug, schema_name);
    EXECUTE format('ALTER TABLE %I.transactions       ADD CONSTRAINT fk_%s_tx_initiator         FOREIGN KEY (initiated_by)        REFERENCES %I.users(id)',            schema_name, tenant_slug, schema_name);
    EXECUTE format('ALTER TABLE %I.payments           ADD CONSTRAINT fk_%s_payment_user         FOREIGN KEY (user_id)             REFERENCES %I.users(id)',            schema_name, tenant_slug, schema_name);
    EXECUTE format('ALTER TABLE %I.payments           ADD CONSTRAINT fk_%s_payment_token        FOREIGN KEY (token_id)            REFERENCES %I.tokens(id)',           schema_name, tenant_slug, schema_name);
    EXECUTE format('ALTER TABLE %I.corporate_actions  ADD CONSTRAINT fk_%s_corpaction_token     FOREIGN KEY (token_id)            REFERENCES %I.tokens(id)',           schema_name, tenant_slug, schema_name);
    EXECUTE format('ALTER TABLE %I.corporate_actions  ADD CONSTRAINT fk_%s_corpaction_creator   FOREIGN KEY (created_by)          REFERENCES %I.users(id)',            schema_name, tenant_slug, schema_name);
    EXECUTE format('ALTER TABLE %I.vesting_schedules  ADD CONSTRAINT fk_%s_vesting_token        FOREIGN KEY (token_id)            REFERENCES %I.tokens(id)',           schema_name, tenant_slug, schema_name);
    EXECUTE format('ALTER TABLE %I.vesting_schedules  ADD CONSTRAINT fk_%s_vesting_user         FOREIGN KEY (user_id)             REFERENCES %I.users(id)',            schema_name, tenant_slug, schema_name);
    EXECUTE format('ALTER TABLE %I.vesting_schedules  ADD CONSTRAINT fk_%s_vesting_creator      FOREIGN KEY (created_by)          REFERENCES %I.users(id)',            schema_name, tenant_slug, schema_name);

    ---------------------------------------------------------------------------
    -- Update triggers
    ---------------------------------------------------------------------------
    EXECUTE format('CREATE TRIGGER trigger_%s_users_updated_at         BEFORE UPDATE ON %I.users             FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', tenant_slug, schema_name);
    EXECUTE format('CREATE TRIGGER trigger_%s_tokens_updated_at        BEFORE UPDATE ON %I.tokens            FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', tenant_slug, schema_name);
    EXECUTE format('CREATE TRIGGER trigger_%s_oid_updated_at           BEFORE UPDATE ON %I.onchain_identities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', tenant_slug, schema_name);
    EXECUTE format('CREATE TRIGGER trigger_%s_compliance_updated_at    BEFORE UPDATE ON %I.compliance_rules   FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', tenant_slug, schema_name);
    EXECUTE format('CREATE TRIGGER trigger_%s_kyc_updated_at           BEFORE UPDATE ON %I.kyc_submissions    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', tenant_slug, schema_name);
    EXECUTE format('CREATE TRIGGER trigger_%s_whitelist_updated_at     BEFORE UPDATE ON %I.whitelist          FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', tenant_slug, schema_name);
    EXECUTE format('CREATE TRIGGER trigger_%s_cap_updated_at           BEFORE UPDATE ON %I.cap_table          FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', tenant_slug, schema_name);
    EXECUTE format('CREATE TRIGGER trigger_%s_payments_updated_at      BEFORE UPDATE ON %I.payments           FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', tenant_slug, schema_name);
    EXECUTE format('CREATE TRIGGER trigger_%s_corpactions_updated_at   BEFORE UPDATE ON %I.corporate_actions  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', tenant_slug, schema_name);
    EXECUTE format('CREATE TRIGGER trigger_%s_vesting_updated_at       BEFORE UPDATE ON %I.vesting_schedules  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', tenant_slug, schema_name);

    RAISE NOTICE 'Tenant schema "%" created successfully.', schema_name;
END;
$$ LANGUAGE plpgsql;

COMMIT;
