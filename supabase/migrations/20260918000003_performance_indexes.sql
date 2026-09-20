-- Performance indexes for ShiftGrid
-- Created: 2026-09-18

-- ============================================
-- Organizations table indexes
-- ============================================

-- Index for status filtering (pending/approved/rejected)
CREATE INDEX IF NOT EXISTS idx_organizations_status
ON organizations (status);

-- Index for owner lookups
CREATE INDEX IF NOT EXISTS idx_organizations_owner_id
ON organizations (owner_id);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_organizations_status_owner
ON organizations (status, owner_id);

-- Index for verification timestamp
CREATE INDEX IF NOT EXISTS idx_organizations_verified_at
ON organizations (verified_at DESC);

-- ============================================
-- Profiles table indexes
-- ============================================

-- Index for organization membership lookups
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id
ON profiles (organization_id);

-- Composite index for role-based queries within org
CREATE INDEX IF NOT EXISTS idx_profiles_org_role
ON profiles (organization_id, role);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_profiles_id
ON profiles (id);

-- ============================================
-- Courts table indexes
-- ============================================

-- Primary organization filter (most common query)
CREATE INDEX IF NOT EXISTS idx_courts_organization_id
ON courts (organization_id);

-- Composite for organization + active status
CREATE INDEX IF NOT EXISTS idx_courts_org_active
ON courts (organization_id, is_active);

-- Composite for organization + sport type filtering
CREATE INDEX IF NOT EXISTS idx_courts_org_sport
ON courts (organization_id, sport_type);

-- Index for availability queries
CREATE INDEX IF NOT EXISTS idx_courts_sport_type
ON courts (sport_type);

-- Index for sorting by creation date
CREATE INDEX IF NOT EXISTS idx_courts_created_at
ON courts (created_at DESC);

-- ============================================
-- Bookings table indexes
-- ============================================

-- Primary court lookup for availability
CREATE INDEX IF NOT EXISTS idx_bookings_court_id
ON bookings (court_id);

-- Composite for court + date range (critical for availability)
CREATE INDEX IF NOT EXISTS idx_bookings_court_date
ON bookings (court_id, start_time, end_time);

-- Organization-wide booking queries
CREATE INDEX IF NOT EXISTS idx_bookings_organization_id
ON bookings (organization_id);

-- User booking history
CREATE INDEX IF NOT EXISTS idx_bookings_user_id
ON bookings (user_id);

-- Status filtering
CREATE INDEX IF NOT EXISTS idx_bookings_status
ON bookings (status);

-- Time-based queries (upcoming, past)
CREATE INDEX IF NOT EXISTS idx_bookings_start_time
ON bookings (start_time DESC);

-- Composite for organization + status + time
CREATE INDEX IF NOT EXISTS idx_bookings_org_status_time
ON bookings (organization_id, status, start_time DESC);

-- ============================================
-- API Keys table indexes
-- ============================================

-- Organization lookup (already has PK on id)
-- Index for key_prefix lookups (verify_api_key function)
CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix
ON api_keys (key_prefix);

-- Organization filtering
CREATE INDEX IF NOT EXISTS idx_api_keys_organization_id
ON api_keys (organization_id);

-- Active keys only
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active
ON api_keys (is_active) WHERE is_active = true;

-- Revoked keys
CREATE INDEX IF NOT EXISTS idx_api_keys_revoked
ON api_keys (revoked_at) WHERE revoked_at IS NOT NULL;

-- ============================================
-- Staff Invites table indexes
-- ============================================

-- Token lookup (accept invite)
CREATE INDEX IF NOT EXISTS idx_staff_invites_token
ON staff_invites (token);

-- Organization invites
CREATE INDEX IF NOT EXISTS idx_staff_invites_organization_id
ON staff_invites (organization_id);

-- Email lookups
CREATE INDEX IF NOT EXISTS idx_staff_invites_email
ON staff_invites (email);

-- Status filtering
CREATE INDEX IF NOT EXISTS idx_staff_invites_status
ON staff_invites (status);

-- Expiry cleanup
CREATE INDEX IF NOT EXISTS idx_staff_invites_expires_at
ON staff_invites (expires_at) WHERE expires_at < NOW();

-- ============================================
-- Verification Documents table indexes
-- ============================================

-- Organization documents
CREATE INDEX IF NOT EXISTS idx_verification_documents_organization_id
ON verification_documents (organization_id);

-- Document type filtering
CREATE INDEX IF NOT EXISTS idx_verification_documents_type
ON verification_documents (document_type);

-- ============================================
-- Partial indexes for common filters
-- ============================================

-- Only active courts for organization
CREATE INDEX IF NOT EXISTS idx_courts_org_active_only
ON courts (organization_id) WHERE is_active = true;

-- Only pending organizations
CREATE INDEX IF NOT EXISTS idx_organizations_pending
ON organizations (created_at DESC) WHERE status = 'pending';

-- Only confirmed bookings
CREATE INDEX IF NOT EXISTS idx_bookings_confirmed
ON bookings (court_id, start_time) WHERE status = 'confirmed';

-- Only active API keys
CREATE INDEX IF NOT EXISTS idx_api_keys_active_org
ON api_keys (organization_id) WHERE is_active = true AND revoked_at IS NULL;

-- ============================================
-- Statistics update
-- ============================================

-- Update table statistics for query planner
ANALYZE organizations;
ANALYZE profiles;
ANALYZE courts;
ANALYZE bookings;
ANALYZE api_keys;
ANALYZE staff_invites;
ANALYZE verification_documents;