-- Migration: 20261123_pass_biometric_family.sql
-- Description: Adds marital status, family members count, children count, covered members count,
--              biometric enrollments, individual pass members, and 1:1 gate verification with live photo.

-- 1. Alter vup.passes table
ALTER TABLE vup.passes ADD COLUMN IF NOT EXISTS marital_status TEXT CHECK (marital_status IN ('MARRIED', 'UNMARRIED'));
ALTER TABLE vup.passes ADD COLUMN IF NOT EXISTS family_members_count INTEGER DEFAULT 1;
ALTER TABLE vup.passes ADD COLUMN IF NOT EXISTS children_count INTEGER DEFAULT 0;
ALTER TABLE vup.passes ADD COLUMN IF NOT EXISTS covered_members_count INTEGER DEFAULT 1;
ALTER TABLE vup.passes ADD COLUMN IF NOT EXISTS enrollment_status TEXT DEFAULT 'ACTIVE' CHECK (enrollment_status IN ('DRAFT', 'PENDING_ENROLLMENT', 'ACTIVE', 'BLOCKED'));

-- 2. Alter vup.pass_members table
ALTER TABLE vup.pass_members ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE vup.pass_members ADD COLUMN IF NOT EXISTS relationship TEXT;
ALTER TABLE vup.pass_members ADD COLUMN IF NOT EXISTS is_primary_holder BOOLEAN DEFAULT false;
ALTER TABLE vup.pass_members ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE';
ALTER TABLE vup.pass_members ADD COLUMN IF NOT EXISTS photo_captured_at TIMESTAMPTZ;
ALTER TABLE vup.pass_members ADD COLUMN IF NOT EXISTS biometric_enrolled_at TIMESTAMPTZ;
ALTER TABLE vup.pass_members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

UPDATE vup.pass_members SET full_name = member_name WHERE full_name IS NULL AND member_name IS NOT NULL;
UPDATE vup.pass_members SET relationship = relation WHERE relationship IS NULL AND relation IS NOT NULL;

-- 3. Create vup.biometric_enrollments table
CREATE TABLE IF NOT EXISTS vup.biometric_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_id UUID NOT NULL REFERENCES vup.passes(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES vup.pass_members(id) ON DELETE CASCADE,
  biometric_type TEXT NOT NULL DEFAULT 'FINGERPRINT',
  device_provider TEXT NOT NULL DEFAULT 'MANTRA_MFS100',
  template_data TEXT NOT NULL,
  template_hash CHAR(64),
  quality_score INTEGER DEFAULT 80,
  status TEXT NOT NULL DEFAULT 'ENROLLED',
  consent_recorded BOOLEAN NOT NULL DEFAULT true,
  guardian_consent_name TEXT,
  enrolled_by UUID REFERENCES vup.staff(id),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(member_id, biometric_type)
);

-- 4. Alter vup.entry_events table
ALTER TABLE vup.entry_events ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES vup.pass_members(id);
ALTER TABLE vup.entry_events ADD COLUMN IF NOT EXISTS entry_photo_url TEXT;
ALTER TABLE vup.entry_events ADD COLUMN IF NOT EXISTS biometric_verified BOOLEAN DEFAULT false;
ALTER TABLE vup.entry_events ADD COLUMN IF NOT EXISTS biometric_match_score NUMERIC(5,2);
ALTER TABLE vup.entry_events ADD COLUMN IF NOT EXISTS biometric_member_id TEXT;
ALTER TABLE vup.entry_events ADD COLUMN IF NOT EXISTS biometric_member_name TEXT;

-- 5. Expose in public schema and grant permissions
CREATE OR REPLACE VIEW public.passes AS
SELECT
  id,
  pass_number,
  order_id,
  plan_id,
  pass_type,
  holder_name,
  holder_phone,
  people_allowed,
  valid_from,
  valid_through,
  qr_token_sha256,
  qr_token_ciphertext,
  qr_token_nonce,
  qr_token_tag,
  status,
  reprint_count,
  created_at,
  updated_at,
  marital_status,
  family_members_count,
  children_count,
  photo_url,
  biometric_id,
  members_json,
  covered_members_count,
  enrollment_status
FROM vup.passes;

CREATE OR REPLACE VIEW public.pass_members AS
SELECT
  id,
  pass_id,
  member_name,
  member_reference,
  relation,
  age,
  photo_url,
  biometric_id,
  biometric_template,
  enabled,
  created_at,
  full_name,
  relationship,
  is_primary_holder,
  status,
  photo_captured_at,
  biometric_enrolled_at,
  updated_at
FROM vup.pass_members;

CREATE OR REPLACE VIEW public.entry_events AS
SELECT
  id,
  request_id,
  document_type,
  ticket_id,
  pass_id,
  gate_id,
  scanned_by,
  result,
  persons_admitted,
  reason,
  scanned_at,
  entry_photo_url,
  biometric_verified,
  biometric_member_id,
  biometric_member_name,
  member_id,
  biometric_match_score
FROM vup.entry_events;

CREATE OR REPLACE VIEW public.biometric_enrollments AS
SELECT * FROM vup.biometric_enrollments;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.passes TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pass_members TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entry_events TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.biometric_enrollments TO anon, authenticated, service_role;
