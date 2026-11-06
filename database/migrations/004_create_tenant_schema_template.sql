-- Migration: 004_create_tenant_schema_template
-- Description: Function to create a full tenant schema with all scoped tables
-- Author: Assetro Platform
-- Date: 2026-04-11

BEGIN;

CREATE OR REPLACE FUNCTION public.create_tenant_schema(tenant_slug TEXT)
RETURNS VOID AS $$
DECLARE
    schema_name TEXT;
BEGIN
    schema_name := 'tenant_' || tenant_slug;

    -- Create the schema
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', schema_name);

    ---------------------------------------------------------------------------
    -- users
    ---------------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email VARCHAR(255) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            name VARCHAR(255) NOT NULL,
            role VARCHAR(50) NOT NULL DEFAULT ''investor''
                CHECK (role IN (''admin'', ''compliance_officer'', ''issuer'', ''investor'', ''viewer'')),
            wallet_address VARCHAR(42),
            is_active BOOLEAN NOT NULL DEFAULT true,
            is_email_verified BOOLEAN NOT NULL DEFAULT false,
            phone VARCHAR(20),
            avatar_url TEXT,
            metadata JSONB NOT NULL DEFAULT ''{}'',
            last_login_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    ', schema_name);

    EXECUTE format('CREATE INDEX idx_%s_users_email ON %I.users (email)', tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX idx_%s_users_role ON %I.users (role)', tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX idx_%s_users_wallet ON %I.users (wallet_address)', tenant_slug, schema_name);

    ---------------------------------------------------------------------------
    -- tokens
    ---------------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            symbol VARCHAR(20) NOT NULL,
            token_type VARCHAR(50) NOT NULL DEFAULT ''equity''
                CHECK (token_type IN (''equity'', ''debt'', ''real_estate'', ''fund'', ''commodity'', ''custom'')),
            total_supply NUMERIC(78, 0) NOT NULL DEFAULT 0,
            decimals INTEGER NOT NULL DEFAULT 18,
            contract_address VARCHAR(42),
            chain_id INTEGER NOT NULL REFERENCES public.supported_chains(chain_id),
            status VARCHAR(30) NOT NULL DEFAULT ''draft''
                CHECK (status IN (''draft'', ''pending_deployment'', ''deployed'', ''paused'', ''retired'')),
            issuer_id UUID NOT NULL,
            description TEXT,
            metadata JSONB NOT NULL DEFAULT ''{}'',
            deployment_tx_hash VARCHAR(66),
            deployed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    ', schema_name);

    EXECUTE format('CREATE INDEX idx_%s_tokens_symbol ON %I.tokens (symbol)', tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX idx_%s_tokens_status ON %I.tokens (status)', tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX idx_%s_tokens_chain ON %I.tokens (chain_id)', tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX idx_%s_tokens_contract ON %I.tokens (contract_address)', tenant_slug, schema_name);

    ---------------------------------------------------------------------------
    -- compliance_rules
    ---------------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.compliance_rules (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            token_id UUID NOT NULL,
            rule_type VARCHAR(100) NOT NULL
                CHECK (rule_type IN (
                    ''max_investors'', ''min_investment'', ''max_investment'',
                    ''accredited_only'', ''country_whitelist'', ''country_blacklist'',
                    ''lock_up_period'', ''transfer_restriction'', ''custom''
                )),
            parameters JSONB NOT NULL DEFAULT ''{}'',
            is_active BOOLEAN NOT NULL DEFAULT true,
            description TEXT,
            created_by UUID NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    ', schema_name);

    EXECUTE format('CREATE INDEX idx_%s_compliance_token ON %I.compliance_rules (token_id)', tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX idx_%s_compliance_type ON %I.compliance_rules (rule_type)', tenant_slug, schema_name);

    ---------------------------------------------------------------------------
    -- kyc_submissions
    ---------------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.kyc_submissions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT ''pending''
                CHECK (status IN (''pending'', ''under_review'', ''approved'', ''rejected'', ''expired'')),
            level VARCHAR(20) NOT NULL DEFAULT ''basic''
                CHECK (level IN (''basic'', ''standard'', ''enhanced'')),
            first_name VARCHAR(255),
            last_name VARCHAR(255),
            date_of_birth DATE,
            nationality VARCHAR(3),
            country_of_residence VARCHAR(3),
            address_line1 TEXT,
            address_line2 TEXT,
            city VARCHAR(255),
            state VARCHAR(255),
            postal_code VARCHAR(20),
            tax_id VARCHAR(100),
            is_accredited BOOLEAN DEFAULT false,
            risk_score INTEGER,
            reviewer_id UUID,
            reviewer_notes TEXT,
            submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            reviewed_at TIMESTAMPTZ,
            expires_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    ', schema_name);

    EXECUTE format('CREATE INDEX idx_%s_kyc_user ON %I.kyc_submissions (user_id)', tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX idx_%s_kyc_status ON %I.kyc_submissions (status)', tenant_slug, schema_name);

    ---------------------------------------------------------------------------
    -- kyc_documents
    ---------------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.kyc_documents (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            kyc_submission_id UUID NOT NULL,
            document_type VARCHAR(50) NOT NULL
                CHECK (document_type IN (
                    ''passport'', ''national_id'', ''drivers_license'',
                    ''proof_of_address'', ''bank_statement'', ''tax_return'',
                    ''accreditation_letter'', ''selfie'', ''other''
                )),
            file_key TEXT NOT NULL,
            file_name VARCHAR(255) NOT NULL,
            file_size INTEGER NOT NULL,
            mime_type VARCHAR(100) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT ''uploaded''
                CHECK (status IN (''uploaded'', ''verified'', ''rejected'')),
            uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    ', schema_name);

    EXECUTE format('CREATE INDEX idx_%s_kycdocs_submission ON %I.kyc_documents (kyc_submission_id)', tenant_slug, schema_name);

    ---------------------------------------------------------------------------
    -- whitelist
    ---------------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.whitelist (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            token_id UUID NOT NULL,
            user_id UUID NOT NULL,
            wallet_address VARCHAR(42) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT ''pending''
                CHECK (status IN (''pending'', ''approved'', ''rejected'', ''revoked'')),
            approved_by UUID,
            approved_at TIMESTAMPTZ,
            revoked_at TIMESTAMPTZ,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(token_id, wallet_address)
        )
    ', schema_name);

    EXECUTE format('CREATE INDEX idx_%s_whitelist_token ON %I.whitelist (token_id)', tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX idx_%s_whitelist_user ON %I.whitelist (user_id)', tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX idx_%s_whitelist_wallet ON %I.whitelist (wallet_address)', tenant_slug, schema_name);

    ---------------------------------------------------------------------------
    -- cap_table
    ---------------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.cap_table (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            token_id UUID NOT NULL,
            user_id UUID NOT NULL,
            wallet_address VARCHAR(42) NOT NULL,
            balance NUMERIC(78, 0) NOT NULL DEFAULT 0,
            locked_balance NUMERIC(78, 0) NOT NULL DEFAULT 0,
            percentage NUMERIC(10, 6) NOT NULL DEFAULT 0,
            last_transfer_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(token_id, wallet_address)
        )
    ', schema_name);

    EXECUTE format('CREATE INDEX idx_%s_cap_token ON %I.cap_table (token_id)', tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX idx_%s_cap_user ON %I.cap_table (user_id)', tenant_slug, schema_name);

    ---------------------------------------------------------------------------
    -- transactions
    ---------------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.transactions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            token_id UUID NOT NULL,
            tx_type VARCHAR(30) NOT NULL
                CHECK (tx_type IN (''mint'', ''burn'', ''transfer'', ''freeze'', ''unfreeze'', ''force_transfer'', ''dividend'')),
            from_address VARCHAR(42),
            to_address VARCHAR(42),
            amount NUMERIC(78, 0) NOT NULL,
            tx_hash VARCHAR(66),
            chain_id INTEGER NOT NULL,
            block_number BIGINT,
            status VARCHAR(20) NOT NULL DEFAULT ''pending''
                CHECK (status IN (''pending'', ''submitted'', ''confirmed'', ''failed'', ''reverted'')),
            gas_used NUMERIC(78, 0),
            gas_price NUMERIC(78, 0),
            initiated_by UUID NOT NULL,
            error_message TEXT,
            metadata JSONB NOT NULL DEFAULT ''{}'',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            confirmed_at TIMESTAMPTZ
        )
    ', schema_name);

    EXECUTE format('CREATE INDEX idx_%s_tx_token ON %I.transactions (token_id)', tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX idx_%s_tx_hash ON %I.transactions (tx_hash)', tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX idx_%s_tx_status ON %I.transactions (status)', tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX idx_%s_tx_from ON %I.transactions (from_address)', tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX idx_%s_tx_to ON %I.transactions (to_address)', tenant_slug, schema_name);

    ---------------------------------------------------------------------------
    -- payments
    ---------------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.payments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL,
            token_id UUID NOT NULL,
            amount NUMERIC(18, 2) NOT NULL,
            currency VARCHAR(10) NOT NULL DEFAULT ''USD'',
            payment_method VARCHAR(30) NOT NULL
                CHECK (payment_method IN (''stripe'', ''wire_transfer'', ''crypto'', ''ach'')),
            status VARCHAR(20) NOT NULL DEFAULT ''pending''
                CHECK (status IN (''pending'', ''processing'', ''completed'', ''failed'', ''refunded'')),
            stripe_payment_intent_id VARCHAR(255),
            stripe_charge_id VARCHAR(255),
            reference_number VARCHAR(255),
            tokens_allocated NUMERIC(78, 0) NOT NULL DEFAULT 0,
            metadata JSONB NOT NULL DEFAULT ''{}'',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    ', schema_name);

    EXECUTE format('CREATE INDEX idx_%s_payments_user ON %I.payments (user_id)', tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX idx_%s_payments_token ON %I.payments (token_id)', tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX idx_%s_payments_status ON %I.payments (status)', tenant_slug, schema_name);

    ---------------------------------------------------------------------------
    -- corporate_actions
    ---------------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.corporate_actions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            token_id UUID NOT NULL,
            action_type VARCHAR(30) NOT NULL
                CHECK (action_type IN (''dividend'', ''stock_split'', ''buyback'', ''rights_issue'', ''voting'', ''custom'')),
            title VARCHAR(255) NOT NULL,
            description TEXT,
            status VARCHAR(20) NOT NULL DEFAULT ''draft''
                CHECK (status IN (''draft'', ''scheduled'', ''in_progress'', ''completed'', ''cancelled'')),
            parameters JSONB NOT NULL DEFAULT ''{}'',
            record_date TIMESTAMPTZ,
            execution_date TIMESTAMPTZ,
            created_by UUID NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    ', schema_name);

    EXECUTE format('CREATE INDEX idx_%s_corpactions_token ON %I.corporate_actions (token_id)', tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX idx_%s_corpactions_status ON %I.corporate_actions (status)', tenant_slug, schema_name);

    ---------------------------------------------------------------------------
    -- vesting_schedules
    ---------------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.vesting_schedules (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            token_id UUID NOT NULL,
            user_id UUID NOT NULL,
            total_amount NUMERIC(78, 0) NOT NULL,
            released_amount NUMERIC(78, 0) NOT NULL DEFAULT 0,
            start_date TIMESTAMPTZ NOT NULL,
            end_date TIMESTAMPTZ NOT NULL,
            cliff_date TIMESTAMPTZ,
            vesting_interval VARCHAR(20) NOT NULL DEFAULT ''monthly''
                CHECK (vesting_interval IN (''daily'', ''weekly'', ''monthly'', ''quarterly'', ''yearly'', ''custom'')),
            status VARCHAR(20) NOT NULL DEFAULT ''active''
                CHECK (status IN (''active'', ''paused'', ''completed'', ''cancelled'')),
            schedule_data JSONB NOT NULL DEFAULT ''[]'',
            created_by UUID NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    ', schema_name);

    EXECUTE format('CREATE INDEX idx_%s_vesting_token ON %I.vesting_schedules (token_id)', tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX idx_%s_vesting_user ON %I.vesting_schedules (user_id)', tenant_slug, schema_name);
    EXECUTE format('CREATE INDEX idx_%s_vesting_status ON %I.vesting_schedules (status)', tenant_slug, schema_name);

    ---------------------------------------------------------------------------
    -- Add foreign key constraints within the tenant schema
    ---------------------------------------------------------------------------
    EXECUTE format('ALTER TABLE %I.tokens ADD CONSTRAINT fk_tokens_issuer FOREIGN KEY (issuer_id) REFERENCES %I.users(id)', schema_name, schema_name);
    EXECUTE format('ALTER TABLE %I.compliance_rules ADD CONSTRAINT fk_compliance_token FOREIGN KEY (token_id) REFERENCES %I.tokens(id)', schema_name, schema_name);
    EXECUTE format('ALTER TABLE %I.compliance_rules ADD CONSTRAINT fk_compliance_creator FOREIGN KEY (created_by) REFERENCES %I.users(id)', schema_name, schema_name);
    EXECUTE format('ALTER TABLE %I.kyc_submissions ADD CONSTRAINT fk_kyc_user FOREIGN KEY (user_id) REFERENCES %I.users(id)', schema_name, schema_name);
    EXECUTE format('ALTER TABLE %I.kyc_documents ADD CONSTRAINT fk_kycdoc_submission FOREIGN KEY (kyc_submission_id) REFERENCES %I.kyc_submissions(id)', schema_name, schema_name);
    EXECUTE format('ALTER TABLE %I.whitelist ADD CONSTRAINT fk_whitelist_token FOREIGN KEY (token_id) REFERENCES %I.tokens(id)', schema_name, schema_name);
    EXECUTE format('ALTER TABLE %I.whitelist ADD CONSTRAINT fk_whitelist_user FOREIGN KEY (user_id) REFERENCES %I.users(id)', schema_name, schema_name);
    EXECUTE format('ALTER TABLE %I.cap_table ADD CONSTRAINT fk_cap_token FOREIGN KEY (token_id) REFERENCES %I.tokens(id)', schema_name, schema_name);
    EXECUTE format('ALTER TABLE %I.cap_table ADD CONSTRAINT fk_cap_user FOREIGN KEY (user_id) REFERENCES %I.users(id)', schema_name, schema_name);
    EXECUTE format('ALTER TABLE %I.transactions ADD CONSTRAINT fk_tx_token FOREIGN KEY (token_id) REFERENCES %I.tokens(id)', schema_name, schema_name);
    EXECUTE format('ALTER TABLE %I.transactions ADD CONSTRAINT fk_tx_initiator FOREIGN KEY (initiated_by) REFERENCES %I.users(id)', schema_name, schema_name);
    EXECUTE format('ALTER TABLE %I.payments ADD CONSTRAINT fk_payment_user FOREIGN KEY (user_id) REFERENCES %I.users(id)', schema_name, schema_name);
    EXECUTE format('ALTER TABLE %I.payments ADD CONSTRAINT fk_payment_token FOREIGN KEY (token_id) REFERENCES %I.tokens(id)', schema_name, schema_name);
    EXECUTE format('ALTER TABLE %I.corporate_actions ADD CONSTRAINT fk_corpaction_token FOREIGN KEY (token_id) REFERENCES %I.tokens(id)', schema_name, schema_name);
    EXECUTE format('ALTER TABLE %I.corporate_actions ADD CONSTRAINT fk_corpaction_creator FOREIGN KEY (created_by) REFERENCES %I.users(id)', schema_name, schema_name);
    EXECUTE format('ALTER TABLE %I.vesting_schedules ADD CONSTRAINT fk_vesting_token FOREIGN KEY (token_id) REFERENCES %I.tokens(id)', schema_name, schema_name);
    EXECUTE format('ALTER TABLE %I.vesting_schedules ADD CONSTRAINT fk_vesting_user FOREIGN KEY (user_id) REFERENCES %I.users(id)', schema_name, schema_name);
    EXECUTE format('ALTER TABLE %I.vesting_schedules ADD CONSTRAINT fk_vesting_creator FOREIGN KEY (created_by) REFERENCES %I.users(id)', schema_name, schema_name);

    ---------------------------------------------------------------------------
    -- Add update triggers for all tables with updated_at
    ---------------------------------------------------------------------------
    EXECUTE format('
        CREATE TRIGGER trigger_%s_users_updated_at BEFORE UPDATE ON %I.users
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()
    ', tenant_slug, schema_name);
    EXECUTE format('
        CREATE TRIGGER trigger_%s_tokens_updated_at BEFORE UPDATE ON %I.tokens
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()
    ', tenant_slug, schema_name);
    EXECUTE format('
        CREATE TRIGGER trigger_%s_compliance_updated_at BEFORE UPDATE ON %I.compliance_rules
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()
    ', tenant_slug, schema_name);
    EXECUTE format('
        CREATE TRIGGER trigger_%s_kyc_updated_at BEFORE UPDATE ON %I.kyc_submissions
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()
    ', tenant_slug, schema_name);
    EXECUTE format('
        CREATE TRIGGER trigger_%s_whitelist_updated_at BEFORE UPDATE ON %I.whitelist
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()
    ', tenant_slug, schema_name);
    EXECUTE format('
        CREATE TRIGGER trigger_%s_cap_updated_at BEFORE UPDATE ON %I.cap_table
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()
    ', tenant_slug, schema_name);
    EXECUTE format('
        CREATE TRIGGER trigger_%s_payments_updated_at BEFORE UPDATE ON %I.payments
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()
    ', tenant_slug, schema_name);
    EXECUTE format('
        CREATE TRIGGER trigger_%s_corpactions_updated_at BEFORE UPDATE ON %I.corporate_actions
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()
    ', tenant_slug, schema_name);
    EXECUTE format('
        CREATE TRIGGER trigger_%s_vesting_updated_at BEFORE UPDATE ON %I.vesting_schedules
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()
    ', tenant_slug, schema_name);

    RAISE NOTICE 'Tenant schema "%" created successfully.', schema_name;
END;
$$ LANGUAGE plpgsql;

COMMIT;
