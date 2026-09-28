-- Performance indexes for ShiftGrid
-- Created: 2026-09-18 · Repaired: 2026-09-29
--
-- REPAIR NOTE: the original file referenced 14 columns/tables that do not exist
-- in this schema (organizations.owner_id, profiles.organization_id,
-- courts.organization_id/is_active/sport_type, bookings.start_time/end_time/
-- organization_id/user_id, api_keys.key_prefix/revoked_at,
-- staff_invites.organization_id/status, and the verification_documents table),
-- plus a partial index on `expires_at < NOW()` which Postgres rejects because
-- NOW() is not IMMUTABLE. It could never apply. This version indexes only real
-- columns and skips anything an earlier migration already created.

-- Organizations
CREATE INDEX IF NOT EXISTS idx_organizations_verified_at
  ON organizations (verified_at DESC);

CREATE INDEX IF NOT EXISTS idx_organizations_pending
  ON organizations (created_at DESC) WHERE status = 'pending';

-- Profiles: role-based queries within an org
CREATE INDEX IF NOT EXISTS idx_profiles_org_role
  ON profiles (org_id, role);

-- Courts
CREATE INDEX IF NOT EXISTS idx_courts_org_sport
  ON courts (org_id, sport);

CREATE INDEX IF NOT EXISTS idx_courts_org_active_only
  ON courts (org_id, sport) WHERE status = 'active';

-- Bookings
-- Availability: overlap scans per court
CREATE INDEX IF NOT EXISTS idx_bookings_court_time
  ON bookings (court_id, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS idx_bookings_org_status_time
  ON bookings (org_id, status, starts_at DESC);

CREATE INDEX IF NOT EXISTS idx_bookings_confirmed
  ON bookings (court_id, starts_at) WHERE status = 'confirmed';

-- API keys: only active keys are ever verified
CREATE INDEX IF NOT EXISTS idx_api_keys_active_org
  ON api_keys (organization_id) WHERE is_active = true;

-- Staff invites
CREATE INDEX IF NOT EXISTS idx_staff_invites_pending
  ON staff_invites (org_id) WHERE accepted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_staff_invites_expires_at
  ON staff_invites (expires_at);

-- Refresh planner statistics
ANALYZE organizations;
ANALYZE profiles;
ANALYZE courts;
ANALYZE bookings;
ANALYZE api_keys;
ANALYZE staff_invites;
