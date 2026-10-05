-- Hybrid data-retention policy, part 1: SOFT DELETE for business entities, no HARD DELETE of history.
--
--  * courts / organizations get `deleted_at`. A soft-deleted court or club disappears from every
--    public listing, from booking, and from the owner's calendar, but every booking keeps pointing at it.
--  * Bookings are never removed: a cancellation is `status = 'cancelled'` (the existing trigger frees the
--    court_slot_locks row and records refunds). Nobody can hard-delete a booking, a court, a club, a player
--    or a guest that has booking history, not a club owner, not a platform admin, not even the service role
--    by accident: the only door is the explicit maintenance function `purge_bookings()` (test data cleanup).
--  * Only the service role (server actions after a role check) can set `deleted_at`.

-- ------------------------------------------------------------------ columns
ALTER TABLE public.courts ADD COLUMN deleted_at timestamptz;
ALTER TABLE public.organizations ADD COLUMN deleted_at timestamptz;
CREATE INDEX courts_live_idx ON public.courts (org_id) WHERE deleted_at IS NULL;
CREATE INDEX organizations_live_idx ON public.organizations (status) WHERE deleted_at IS NULL;

-- Column-level SELECT is in force on organizations: visitors may know a row is archived (it is hidden from
-- them anyway); the policies below read the column.
GRANT SELECT (deleted_at) ON public.organizations TO anon, authenticated;
GRANT SELECT (deleted_at) ON public.courts TO anon, authenticated;

-- ------------------------------------------------------- "live" everywhere it matters
-- org_is_approved() feeds the public policies of courts, locks and bookings, so one change here hides
-- an archived club from every public path.
CREATE OR REPLACE FUNCTION public.org_is_approved(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = p_org_id AND status = 'approved' AND deleted_at IS NULL
  );
$function$;

DROP POLICY "Anyone can view approved organizations" ON public.organizations;
CREATE POLICY "Anyone can view approved organizations" ON public.organizations
  FOR SELECT TO anon USING (status = 'approved' AND deleted_at IS NULL);

DROP POLICY "Anyone can view active courts of approved organizations" ON public.courts;
CREATE POLICY "Anyone can view active courts of approved organizations" ON public.courts
  FOR SELECT TO anon, authenticated
  USING (status = 'active' AND deleted_at IS NULL AND org_is_approved(org_id));

DROP POLICY "Anyone can view slot locks of public courts" ON public.court_slot_locks;
CREATE POLICY "Anyone can view slot locks of public courts" ON public.court_slot_locks
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.courts c
     WHERE c.id = court_slot_locks.court_id AND c.status = 'active' AND c.deleted_at IS NULL AND org_is_approved(c.org_id)
  ));

-- A club's own staff and players can still READ its archived courts (so old bookings keep their court name),
-- but nobody can edit an archived court, and a client can never set or clear `deleted_at`.
DROP POLICY "Org admins can update courts" ON public.courts;
CREATE POLICY "Org admins can update courts" ON public.courts
  FOR UPDATE USING (org_id = user_org_id() AND user_role() = 'org_admin' AND deleted_at IS NULL)
  WITH CHECK (org_id = user_org_id() AND user_role() = 'org_admin' AND deleted_at IS NULL);

-- A booking can only be placed on a live court of a live club (the app checks too; this is the engine's own lock).
CREATE OR REPLACE FUNCTION public.assign_court()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  available_court_id uuid;
  v_buffer_end timestamptz;
BEGIN
  IF EXISTS (SELECT 1 FROM organizations WHERE id = NEW.org_id AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid_court';
  END IF;

  IF NEW.court_id IS NOT NULL THEN
    PERFORM 1 FROM courts c
    WHERE c.id = NEW.court_id
      AND c.org_id = NEW.org_id
      AND c.sport = NEW.sport
      AND c.status = 'active'
      AND c.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid_court';
    END IF;
    RETURN NEW;
  END IF;

  v_buffer_end := COALESCE(
    NEW.buffer_ends_at,
    NEW.starts_at + get_sport_duration(NEW.sport) + INTERVAL '15 minutes'
  );

  SELECT c.id INTO available_court_id
  FROM courts c
  WHERE c.org_id = NEW.org_id
    AND c.sport = NEW.sport
    AND c.status = 'active'
    AND c.deleted_at IS NULL
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
$function$;

-- An archived club's API keys stop working at once.
CREATE OR REPLACE FUNCTION public.verify_api_key(input_key text)
RETURNS TABLE(valid boolean, organization_id uuid, permissions text[], rate_limit integer, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_key_hash TEXT;
  v_prefix TEXT;
  v_key RECORD;
BEGIN
  IF input_key IS NULL OR NOT starts_with(input_key, 'sg_live_') THEN
    RETURN QUERY SELECT false, NULL::UUID, ARRAY[]::TEXT[], 0, 'Invalid API key format';
    RETURN;
  END IF;

  v_prefix := SUBSTRING(input_key FROM 1 FOR 12);
  v_key_hash := encode(digest(input_key, 'sha256'), 'hex');

  SELECT * INTO v_key FROM api_keys WHERE prefix = v_prefix;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, ARRAY[]::TEXT[], 0, 'Invalid API key';
    RETURN;
  END IF;

  IF NOT v_key.is_active THEN
    RETURN QUERY SELECT false, NULL::UUID, ARRAY[]::TEXT[], 0, 'API key has been revoked';
    RETURN;
  END IF;

  IF v_key.expires_at IS NOT NULL AND v_key.expires_at < NOW() THEN
    RETURN QUERY SELECT false, NULL::UUID, ARRAY[]::TEXT[], 0, 'API key has expired';
    RETURN;
  END IF;

  IF v_key.key_hash != v_key_hash THEN
    RETURN QUERY SELECT false, NULL::UUID, ARRAY[]::TEXT[], 0, 'Invalid API key';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM organizations o WHERE o.id = v_key.organization_id AND o.deleted_at IS NOT NULL) THEN
    RETURN QUERY SELECT false, NULL::UUID, ARRAY[]::TEXT[], 0, 'This club has been closed';
    RETURN;
  END IF;

  UPDATE api_keys SET last_used_at = NOW() WHERE id = v_key.id;

  RETURN QUERY SELECT true, v_key.organization_id, v_key.permissions, v_key.rate_limit, NULL::TEXT;
END;
$function$;

-- ----------------------------------------- archiving a court (any path, any role)
-- A court with upcoming open bookings cannot be archived: the owner cancels or moves them first.
CREATE OR REPLACE FUNCTION public.guard_court_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  n int;
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    SELECT count(*) INTO n FROM public.bookings
     WHERE court_id = NEW.id AND status IN ('pending_payment', 'confirmed') AND ends_at > now();
    IF n > 0 THEN
      RAISE EXCEPTION 'has_upcoming_bookings:%', n;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_court_archive() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_guard_court_archive
  BEFORE UPDATE OF deleted_at ON public.courts
  FOR EACH ROW EXECUTE FUNCTION public.guard_court_archive();

-- ------------------------------------------------------------ hard-delete guards
-- No client role can delete bookings or courts any more (this removes the owner's and the platform admin's
-- DELETE policies: a platform admin can no longer cascade-delete live data).
DROP POLICY "Org admins can delete bookings in their org" ON public.bookings;
DROP POLICY "Platform admins can delete bookings" ON public.bookings;
DROP POLICY "Org admins can delete courts" ON public.courts;
DROP POLICY "Platform admins can delete courts" ON public.courts;
REVOKE DELETE ON public.bookings FROM authenticated;
REVOKE DELETE ON public.courts FROM authenticated;

-- Defence in depth for every other role (service role included): a row that carries booking history cannot
-- be deleted, and a cascade from a parent (club -> bookings, court -> bookings, player -> bookings) is stopped
-- at the first step. Maintenance that really must delete (test data) goes through purge_bookings(), which
-- raises a transaction-local flag; nothing else sets it.
CREATE OR REPLACE FUNCTION public.hard_delete_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$ SELECT coalesce(current_setting('app.allow_hard_delete', true), '') = '1' $$;

CREATE OR REPLACE FUNCTION public.guard_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF public.hard_delete_allowed() THEN
    RETURN OLD;
  END IF;

  IF TG_TABLE_NAME = 'bookings' THEN
    RAISE EXCEPTION 'hard_delete_blocked: bookings are never deleted; cancel the booking instead (status = cancelled)';
  ELSIF TG_TABLE_NAME = 'courts' AND EXISTS (SELECT 1 FROM public.bookings WHERE court_id = OLD.id) THEN
    RAISE EXCEPTION 'hard_delete_blocked: this court has booking history; archive it instead (deleted_at)';
  ELSIF TG_TABLE_NAME = 'organizations' AND EXISTS (SELECT 1 FROM public.bookings WHERE org_id = OLD.id) THEN
    RAISE EXCEPTION 'hard_delete_blocked: this club has booking history; archive it instead (deleted_at)';
  ELSIF TG_TABLE_NAME = 'profiles' AND EXISTS (SELECT 1 FROM public.bookings WHERE booker_profile_id = OLD.id) THEN
    RAISE EXCEPTION 'hard_delete_blocked: this player has booking history; anonymize the account instead';
  ELSIF TG_TABLE_NAME = 'anonymous_bookers' AND EXISTS (SELECT 1 FROM public.bookings WHERE booker_anon_id = OLD.id) THEN
    RAISE EXCEPTION 'hard_delete_blocked: this guest has booking history; anonymize the guest instead';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_hard_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hard_delete_allowed() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_guard_hard_delete BEFORE DELETE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.guard_hard_delete();
CREATE TRIGGER trg_guard_hard_delete BEFORE DELETE ON public.courts FOR EACH ROW EXECUTE FUNCTION public.guard_hard_delete();
CREATE TRIGGER trg_guard_hard_delete BEFORE DELETE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.guard_hard_delete();
CREATE TRIGGER trg_guard_hard_delete BEFORE DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_hard_delete();
CREATE TRIGGER trg_guard_hard_delete BEFORE DELETE ON public.anonymous_bookers FOR EACH ROW EXECUTE FUNCTION public.guard_hard_delete();

-- The one explicit door: remove booking rows (and, by cascade, their locks, payments, shares, notes and
-- notifications). For deleting TEST data from scripts; never called by the app.
CREATE OR REPLACE FUNCTION public.purge_bookings(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  n integer;
BEGIN
  PERFORM set_config('app.allow_hard_delete', '1', true);
  DELETE FROM public.bookings WHERE id = ANY (p_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('app.allow_hard_delete', '', true);
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.purge_bookings(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_bookings(uuid[]) TO service_role;

-- ----------------------------------------------------------- archive / restore a club
-- The platform admin's way to "delete" a club: a flag, never a DELETE. Upcoming open bookings must be
-- dealt with explicitly: either refuse (default) or cancel them (the slot locks are freed and refunds
-- recorded by the existing cancellation trigger). Returns the cancelled booking ids so the app can
-- email the players.
CREATE OR REPLACE FUNCTION public.archive_organization(p_org_id uuid, p_cancel_upcoming boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  PERFORM 1 FROM public.organizations WHERE id = p_org_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'org_not_found';
  END IF;

  SELECT coalesce(array_agg(id), '{}') INTO v_ids FROM public.bookings
   WHERE org_id = p_org_id AND status IN ('pending_payment', 'confirmed') AND ends_at > now();

  IF cardinality(v_ids) > 0 THEN
    IF NOT p_cancel_upcoming THEN
      RAISE EXCEPTION 'has_upcoming_bookings:%', cardinality(v_ids);
    END IF;
    UPDATE public.bookings SET status = 'cancelled', cancellation_reason = 'The club has closed'
     WHERE id = ANY (v_ids);
  END IF;

  UPDATE public.courts SET deleted_at = now() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE public.organizations SET deleted_at = now() WHERE id = p_org_id;
  UPDATE public.api_keys SET is_active = false WHERE organization_id = p_org_id AND is_active;

  RETURN jsonb_build_object('org_id', p_org_id, 'cancelled_booking_ids', to_jsonb(v_ids));
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_organization(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_ts timestamptz;
BEGIN
  SELECT deleted_at INTO v_ts FROM public.organizations WHERE id = p_org_id AND deleted_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'org_not_found';
  END IF;
  UPDATE public.organizations SET deleted_at = NULL WHERE id = p_org_id;
  -- Only the courts archived WITH the club (same timestamp) come back; one the owner archived earlier stays archived.
  UPDATE public.courts SET deleted_at = NULL WHERE org_id = p_org_id AND deleted_at = v_ts;
  RETURN jsonb_build_object('org_id', p_org_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.archive_organization(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_organization(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_organization(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_organization(uuid) TO service_role;
