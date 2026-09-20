-- ShiftGrid API Keys Management
-- Adds API key generation, validation, and rate limiting support

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- API KEYS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  permissions TEXT[] NOT NULL DEFAULT ARRAY['read']::TEXT[],
  rate_limit INTEGER NOT NULL DEFAULT 1000,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_organization_id ON api_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_created_by ON api_keys(created_by);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Org admins and platform admins can view API keys
CREATE POLICY "Org admins and platform admins can view API keys"
  ON api_keys FOR SELECT
  USING (
    organization_id = public.user_org_id() OR
    public.user_role() = 'platform_admin'
  );

-- Only org admins and platform admins can create API keys
CREATE POLICY "Org admins can create API keys"
  ON api_keys FOR INSERT
  WITH CHECK (
    organization_id = public.user_org_id() AND
    public.user_role() = 'org_admin'
  );

-- Only org admins and platform admins can update API keys
CREATE POLICY "Org admins can update API keys"
  ON api_keys FOR UPDATE
  USING (
    organization_id = public.user_org_id() AND
    public.user_role() = 'org_admin'
  );

-- Only org admins and platform admins can delete/revoke API keys
CREATE POLICY "Org admins can delete API keys"
  ON api_keys FOR DELETE
  USING (
    organization_id = public.user_org_id() AND
    public.user_role() = 'org_admin'
  );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER trigger_api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Verify API key and return user info (called from API routes)
CREATE OR REPLACE FUNCTION verify_api_key(input_key TEXT)
RETURNS TABLE (
  valid BOOLEAN,
  organization_id UUID,
  permissions TEXT[],
  rate_limit INTEGER,
  error TEXT
) AS $$
DECLARE
  v_key_hash TEXT;
  v_prefix TEXT;
  v_key RECORD;
BEGIN
  -- Check if key has valid format
  IF input_key IS NULL OR NOT input_key STARTS WITH 'sg_live_' THEN
    RETURN QUERY SELECT false, NULL::UUID, ARRAY[]::TEXT[], 0, 'Invalid API key format';
    RETURN;
  END IF;

  -- Extract prefix (first 12 chars after 'sg_live_')
  v_prefix := SUBSTRING(input_key FROM 1 FOR 12);
  v_key_hash := encode(digest(input_key, 'sha256'), 'hex');

  -- Lookup key in database
  SELECT *
  INTO v_key
  FROM api_keys
  WHERE prefix = v_prefix;

  -- Key not found
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, ARRAY[]::TEXT[], 0, 'Invalid API key';
    RETURN;
  END IF;

  -- Check if key has been revoked
  IF NOT v_key.is_active THEN
    RETURN QUERY SELECT false, NULL::UUID, ARRAY[]::TEXT[], 0, 'API key has been revoked';
    RETURN;
  END IF;

  -- Check if key has expired
  IF v_key.expires_at IS NOT NULL AND v_key.expires_at < NOW() THEN
    RETURN QUERY SELECT false, NULL::UUID, ARRAY[]::TEXT[], 0, 'API key has expired';
    RETURN;
  END IF;

  -- Validate hash (constant time comparison)
  IF v_key.key_hash != v_key_hash THEN
    RETURN QUERY SELECT false, NULL::UUID, ARRAY[]::TEXT[], 0, 'Invalid API key';
    RETURN;
  END IF;

  -- Update last used timestamp
  UPDATE api_keys
  SET last_used_at = NOW()
  WHERE id = v_key.id;

  -- Return valid response
  RETURN QUERY SELECT true, v_key.organization_id, v_key.permissions, v_key.rate_limit, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Generate a new API key (called from server actions)
CREATE OR REPLACE FUNCTION generate_api_key(
  p_organization_id UUID,
  p_name TEXT,
  p_permissions TEXT[],
  p_rate_limit INTEGER,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  key TEXT,
  prefix TEXT,
  permissions TEXT[],
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  v_key TEXT;
  v_key_hash TEXT;
  v_prefix TEXT;
  v_result RECORD;
BEGIN
  -- Generate secure API key
  v_key := 'sg_live_' || encode(gen_random_bytes(32), 'hex');
  v_prefix := SUBSTRING(v_key FROM 1 FOR 12);
  v_key_hash := encode(digest(v_key, 'sha256'), 'hex');

  -- Insert key into database
  INSERT INTO api_keys (
    organization_id,
    name,
    key_hash,
    prefix,
    permissions,
    rate_limit,
    expires_at,
    created_by
  )
  VALUES (
    p_organization_id,
    p_name,
    v_key_hash,
    v_prefix,
    COALESCE(p_permissions, ARRAY['read']::TEXT[]),
    COALESCE(p_rate_limit, 1000),
    p_expires_at,
    auth.uid()
  )
  RETURNING *
  INTO v_result;

  -- Return the full key (only returned once!)
  RETURN QUERY SELECT
    v_result.id,
    v_result.name,
    v_key AS key,
    v_result.prefix,
    v_result.permissions,
    v_result.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revoke an API key
CREATE OR REPLACE FUNCTION revoke_api_key(p_key_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE api_keys
  SET is_active = false
  WHERE id = p_key_id
  AND organization_id = public.user_org_id()
  AND public.user_role() = 'org_admin';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'API key not found or insufficient permissions';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON api_keys TO authenticated;
GRANT USAGE ON api_keys_id_seq TO authenticated;
GRANT EXECUTE ON FUNCTION verify_api_key TO authenticated;
GRANT EXECUTE ON FUNCTION generate_api_key TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_api_key TO authenticated;