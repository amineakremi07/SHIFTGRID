-- ShiftGrid Verification System + Staff Invites
-- Adds company verification workflow and staff invitation system

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ORGANIZATIONS TABLE EXTENSIONS
-- ============================================================================

-- Add verification status and related fields
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'approved', 'rejected', 'suspended'));

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verification_documents JSONB DEFAULT '{}';

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS registry_number TEXT;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES profiles(id);

-- Index for verification queries
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);
CREATE INDEX IF NOT EXISTS idx_organizations_registry_number ON organizations(registry_number);

-- ============================================================================
-- STAFF INVITES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS staff_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('org_admin', 'staff')),
  invited_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_invites_org_id ON staff_invites(org_id);
CREATE INDEX IF NOT EXISTS idx_staff_invites_token ON staff_invites(token);
CREATE INDEX IF NOT EXISTS idx_staff_invites_email ON staff_invites(email);

-- ============================================================================
-- RLS POLICIES: organizations (extend existing)
-- ============================================================================

-- Allow org_admins to update their own org (for profile completion after approval)
-- But status changes only by platform_admin
CREATE POLICY "Org admins can update their org details (not status)"
  ON organizations FOR UPDATE
  USING (
    id = public.user_org_id() AND
    public.user_role() = 'org_admin'
  )
  WITH CHECK (
    id = public.user_org_id() AND
    public.user_role() = 'org_admin' AND
    status = (SELECT status FROM organizations WHERE id = public.user_org_id()) -- prevent status change
  );

-- Platform admins can update status
CREATE POLICY "Platform admins can update organization status"
  ON organizations FOR UPDATE
  USING (public.user_role() = 'platform_admin')
  WITH CHECK (public.user_role() = 'platform_admin');

-- ============================================================================
-- RLS POLICIES: staff_invites
-- ============================================================================

ALTER TABLE staff_invites ENABLE ROW LEVEL SECURITY;

-- Org admins can view invites for their org
CREATE POLICY "Org admins can view staff invites in their org"
  ON staff_invites FOR SELECT
  USING (
    org_id = public.user_org_id() AND
    public.user_role() IN ('org_admin', 'staff')
  );

-- Org admins can create invites
CREATE POLICY "Org admins can create staff invites"
  ON staff_invites FOR INSERT
  WITH CHECK (
    org_id = public.user_org_id() AND
    public.user_role() = 'org_admin'
  );

-- Org admins can update invites (resend, cancel)
CREATE POLICY "Org admins can update staff invites"
  ON staff_invites FOR UPDATE
  USING (
    org_id = public.user_org_id() AND
    public.user_role() = 'org_admin'
  );

-- Platform admins can view all invites
CREATE POLICY "Platform admins can view all staff invites"
  ON staff_invites FOR SELECT
  USING (public.user_role() = 'platform_admin');

-- Allow public access to validate invite tokens (for accept-invite page)
CREATE POLICY "Public can validate invite token"
  ON staff_invites FOR SELECT
  USING (true);

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE TRIGGER trigger_staff_invites_updated_at
  BEFORE UPDATE ON staff_invites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON staff_invites TO authenticated;
GRANT SELECT ON staff_invites TO anon;

-- ============================================================================
-- HELPER FUNCTION: Generate secure invite token
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_invite_token()
RETURNS TEXT AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql VOLATILE;