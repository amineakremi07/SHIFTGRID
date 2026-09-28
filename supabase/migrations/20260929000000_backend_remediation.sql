-- ShiftGrid backend remediation (2026-09-29)
-- Fixes the 8 defects found by the backend verification suite.
-- Role names: the platform super-user role is 'platform_admin' (there is no 'super_admin').

-- ============================================================================
-- Helper: is an organization publicly listed? (SECURITY DEFINER so policies on
-- courts / court_slot_locks can ask without needing SELECT on organizations.)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.org_is_approved(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = p_org_id AND status = 'approved'
  );
$$;
REVOKE EXECUTE ON FUNCTION public.org_is_approved(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.org_is_approved(uuid) TO anon, authenticated;

-- ============================================================================
-- DEFECT 6 - public visibility of approved organizations / active courts
-- organizations holds private columns (verification_documents is a URL to the
-- registration proof, plus registry_number, verified_by), so anon gets COLUMN
-- level access to the public ones only. A row policy alone would leak them.
-- ============================================================================
REVOKE SELECT ON public.organizations FROM anon;
GRANT SELECT (id, name, address, city, sport_types, timezone, status, created_at, updated_at)
  ON public.organizations TO anon;

CREATE POLICY "Anyone can view approved organizations"
  ON public.organizations FOR SELECT TO anon
  USING (status = 'approved');

CREATE POLICY "Anyone can view active courts of approved organizations"
  ON public.courts FOR SELECT TO anon, authenticated
  USING (status = 'active' AND public.org_is_approved(org_id));

-- Availability: occupied ranges of public courts (needed to render the slot grid)
CREATE POLICY "Anyone can view slot locks of public courts"
  ON public.court_slot_locks FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.courts c
      WHERE c.id = court_slot_locks.court_id
        AND c.status = 'active'
        AND public.org_is_approved(c.org_id)
    )
  );

-- Least privilege: anon has no business reading these tables at all.
REVOKE SELECT ON public.profiles, public.payment_records,
                 public.anonymous_bookers, public.staff_invites FROM anon;

-- TRUNCATE / REFERENCES / TRIGGER are not governed by RLS and were granted by default.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- ============================================================================
-- DEFECT 3 - staff_invites exposure
-- ============================================================================
DROP POLICY "Public can validate invite token" ON public.staff_invites;
DROP POLICY "Org admins can view staff invites in their org" ON public.staff_invites;

CREATE POLICY "Org admins can view staff invites in their org"
  ON public.staff_invites FOR SELECT TO authenticated
  USING (org_id = public.user_org_id() AND public.user_role() = 'org_admin');

CREATE POLICY "Recipients can view their own invite"
  ON public.staff_invites FOR SELECT TO authenticated
  USING (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
-- (platform_admin keeps "Platform admins can view all staff invites".)
-- Token validation runs server-side through the service role (acceptStaffInvite).

-- ============================================================================
-- DEFECT 4 - staff_invites.updated_at (the shared trigger assumed it existed)
-- ============================================================================
ALTER TABLE public.staff_invites
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ============================================================================
-- DEFECT 5 - API key generation: caller must administer the TARGET organization
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_api_key(
  p_organization_id uuid,
  p_name text,
  p_permissions text[],
  p_rate_limit integer,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid, name text, key text, prefix text, permissions text[], created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_key text;
  v_key_hash text;
  v_prefix text;
  v_result record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.user_role() = 'platform_admin'
    OR (public.user_role() = 'org_admin' AND public.user_org_id() = p_organization_id)
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions to create API keys for this organization'
      USING ERRCODE = '42501';
  END IF;

  v_key := 'sg_live_' || encode(gen_random_bytes(32), 'hex');
  v_prefix := substring(v_key FROM 1 FOR 12);
  v_key_hash := encode(digest(v_key, 'sha256'), 'hex');

  INSERT INTO api_keys (
    organization_id, name, key_hash, prefix, permissions, rate_limit, expires_at, created_by
  )
  VALUES (
    p_organization_id, p_name, v_key_hash, v_prefix,
    COALESCE(p_permissions, ARRAY['read']::text[]),
    COALESCE(p_rate_limit, 1000),
    p_expires_at,
    auth.uid()
  )
  RETURNING * INTO v_result;

  RETURN QUERY SELECT
    v_result.id, v_result.name, v_key AS key, v_result.prefix,
    v_result.permissions, v_result.created_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_api_key(uuid, text, text[], integer, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_api_key(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verify_api_key(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.generate_api_key(uuid, text, text[], integer, timestamptz) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.revoke_api_key(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.verify_api_key(text) TO authenticated;

-- ============================================================================
-- DEFECT 2 - the booking trigger chain must not depend on the caller's rights
-- create_court_lock / handle_booking_cancellation write to court_slot_locks,
-- which players cannot touch; assign_court must see EVERY lock to be correct.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_court_lock()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  INSERT INTO court_slot_locks (court_id, occupied_from, occupied_until, booking_id)
  VALUES (NEW.court_id, NEW.starts_at, NEW.buffer_ends_at, NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_booking_cancellation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    DELETE FROM court_slot_locks WHERE booking_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- DEFECT 1 - deterministic trigger order + a self-sufficient assign_court
-- BEFORE triggers fire alphabetically, so assign_court used to run before
-- set_booking_times and saw buffer_ends_at = NULL (an unbounded range).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.assign_court()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  available_court_id uuid;
  v_buffer_end timestamptz;
BEGIN
  -- Do not rely on trigger order: derive the range end here if it is not set yet.
  v_buffer_end := COALESCE(
    NEW.buffer_ends_at,
    NEW.starts_at + get_sport_duration(NEW.sport) + INTERVAL '15 minutes'
  );

  SELECT c.id INTO available_court_id
  FROM courts c
  WHERE c.org_id = NEW.org_id
    AND c.sport = NEW.sport
    AND c.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM court_slot_locks csl
      WHERE csl.court_id = c.id
        AND tstzrange(csl.occupied_from, csl.occupied_until) &&
            tstzrange(NEW.starts_at, v_buffer_end)
    )
  LIMIT 1;

  IF available_court_id IS NULL THEN
    RAISE EXCEPTION 'No available courts for sport % at requested time', NEW.sport;
  END IF;

  NEW.court_id := available_court_id;
  RETURN NEW;
END;
$$;

ALTER TRIGGER trigger_set_booking_times ON public.bookings RENAME TO trg_10_set_booking_times;
ALTER TRIGGER trigger_assign_court      ON public.bookings RENAME TO trg_20_assign_court;
-- The AFTER INSERT lock trigger always runs after every BEFORE trigger.

-- ============================================================================
-- DEFECT 7 - DELETE privilege (row access still enforced by RLS)
-- ============================================================================
GRANT DELETE ON public.courts, public.bookings TO authenticated;

CREATE POLICY "Platform admins can delete courts"
  ON public.courts FOR DELETE TO authenticated
  USING (public.user_role() = 'platform_admin');

CREATE POLICY "Org admins can delete bookings in their org"
  ON public.bookings FOR DELETE TO authenticated
  USING (org_id = public.user_org_id() AND public.user_role() = 'org_admin');

CREATE POLICY "Platform admins can delete bookings"
  ON public.bookings FOR DELETE TO authenticated
  USING (public.user_role() = 'platform_admin');

-- ============================================================================
-- DEFECT 8 - pin search_path on every remaining custom function
-- (assign_court, create_court_lock, handle_booking_cancellation, generate_api_key
--  were pinned above via CREATE OR REPLACE.)
-- ============================================================================
ALTER FUNCTION public.generate_invite_token()   SET search_path = public, extensions;
ALTER FUNCTION public.get_sport_duration(text)  SET search_path = public, extensions;
ALTER FUNCTION public.set_booking_times()       SET search_path = public, extensions;
ALTER FUNCTION public.update_updated_at()       SET search_path = public, extensions;
ALTER FUNCTION public.user_org_id()             SET search_path = public, extensions;
ALTER FUNCTION public.user_role()               SET search_path = public, extensions;
ALTER FUNCTION public.verify_api_key(text)      SET search_path = public, extensions;
ALTER FUNCTION public.revoke_api_key(uuid)      SET search_path = public, extensions;
