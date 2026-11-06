-- Migration 012: Expanded fields for Issuer Leads
-- Captures registered office address, operating address, and full authorized representative verification details.

ALTER TABLE public.issuer_leads
  ADD COLUMN IF NOT EXISTS registered_address VARCHAR(500),
  ADD COLUMN IF NOT EXISTS address_line_2 VARCHAR(500),
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS state_province VARCHAR(100),
  ADD COLUMN IF NOT EXISTS postal_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS is_operating_address_same BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS operating_address TEXT,
  ADD COLUMN IF NOT EXISTS authorized_representative_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS nationality VARCHAR(100),
  ADD COLUMN IF NOT EXISTS identity_document_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS identity_document_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS proof_of_identity_url VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS proof_of_identity_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS authorization_letter_url VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS authorization_letter_name VARCHAR(255);

COMMENT ON COLUMN public.issuer_leads.registered_address IS 'Registered office street address line 1';
COMMENT ON COLUMN public.issuer_leads.address_line_2 IS 'Registered office address line 2 (suite, floor, unit)';
COMMENT ON COLUMN public.issuer_leads.city IS 'Registered office city';
COMMENT ON COLUMN public.issuer_leads.state_province IS 'Registered office state or province';
COMMENT ON COLUMN public.issuer_leads.postal_code IS 'Registered office postal / zip code';
COMMENT ON COLUMN public.issuer_leads.is_operating_address_same IS 'Whether business operating address is identical to registered address';
COMMENT ON COLUMN public.issuer_leads.operating_address IS 'Business operating address if different from registered office';
COMMENT ON COLUMN public.issuer_leads.authorized_representative_name IS 'Full legal name of authorized representative';
COMMENT ON COLUMN public.issuer_leads.nationality IS 'Nationality of authorized representative';
COMMENT ON COLUMN public.issuer_leads.identity_document_type IS 'Identity document type (e.g., Passport, National ID, PAN)';
COMMENT ON COLUMN public.issuer_leads.identity_document_number IS 'Identity document number';
COMMENT ON COLUMN public.issuer_leads.proof_of_identity_url IS 'URL to uploaded proof of identity document';
COMMENT ON COLUMN public.issuer_leads.proof_of_identity_name IS 'Original file name of proof of identity document';
COMMENT ON COLUMN public.issuer_leads.authorization_letter_url IS 'URL to uploaded board resolution or authorization letter';
COMMENT ON COLUMN public.issuer_leads.authorization_letter_name IS 'Original file name of authorization letter';
