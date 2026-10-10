-- Phase 2 hardening.
--
-- 1. A platform admin has no automatic access to any club's data (the owner's rule). The admin portal runs on the
--    service role after a role check, so these client-side policies were unused; they only let an admin SESSION read
--    every club's bookings, invitations, API keys and organizations straight through the REST API.
-- 2. Anti-griefing for guest bookings: at most 2 open `pending_payment` bookings per phone number and club.
-- 3. release_stale_bookings(): the database half of auto-release (prepared; nothing schedules it yet).

/* --------------------- 1. platform admin: no blanket read access --------------------- */

DROP POLICY IF EXISTS "Platform admins can view all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Platform admins can view all staff invites" ON public.staff_invites;
DROP POLICY IF EXISTS "Platform admins can view all organizations" ON public.organizations;

-- api_keys: the combined policy also let a platform admin list every club's keys. Keep the club owner's own.
DROP POLICY IF EXISTS "Org admins and platform admins can view API keys" ON public.api_keys;
CREATE POLICY "Org admins can view their API keys" ON public.api_keys
  FOR SELECT TO authenticated
  USING (organization_id = public.user_org_id() AND public.user_role() = 'org_admin');

/* ------------------- 2. guest cap inside create_booking() ------------------- */

CREATE OR REPLACE FUNCTION public.create_booking(
  p_org_id uuid, p_court_id uuid, p_sport text, p_starts_at timestamp with time zone, p_player_count integer, p_amount numeric,
  p_profile_id uuid DEFAULT NULL::uuid, p_guest_name text DEFAULT NULL::text, p_guest_phone text DEFAULT NULL::text,
  p_status text DEFAULT 'pending_payment'::text, p_source text DEFAULT 'online'::text, p_notes text DEFAULT NULL::text,
  p_paid boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_profile public.profiles;
  v_anon_id uuid;
  v_booking public.bookings;
  v_token text;
  v_pass_token text;
  v_open integer;
  v_phone text := nullif(btrim(coalesce(p_guest_phone, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
BEGIN
  IF p_status NOT IN ('pending_payment', 'confirmed') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;
  IF p_source NOT IN ('online', 'manual', 'phone') THEN
    RAISE EXCEPTION 'invalid_source';
  END IF;
  IF p_paid AND (p_source = 'online' OR p_status <> 'confirmed') THEN
    RAISE EXCEPTION 'invalid_paid';
  END IF;
  IF p_starts_at <= now() THEN
    RAISE EXCEPTION 'slot_in_past';
  END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  IF p_profile_id IS NOT NULL THEN
    SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id;
    IF NOT FOUND OR v_profile.role <> 'player' OR v_profile.org_id <> p_org_id THEN
      RAISE EXCEPTION 'not_a_member';
    END IF;
    IF v_profile.is_suspended THEN
      IF v_profile.suspended_until IS NULL OR v_profile.suspended_until > now() THEN
        RAISE EXCEPTION 'account_suspended';
      END IF;
      UPDATE public.profiles SET is_suspended = false, suspended_until = NULL WHERE id = p_profile_id;
    END IF;
    v_pass_token := encode(gen_random_bytes(24), 'hex');
  ELSE
    IF btrim(coalesce(p_guest_name, '')) = '' OR (v_phone IS NULL AND p_source = 'online') THEN
      RAISE EXCEPTION 'guest_details_required';
    END IF;

    -- Anti-griefing: an unverified guest may hold at most 2 unpaid, unfinished bookings per club. The advisory
    -- lock makes two simultaneous requests for the same number count each other. Staff bookings are not capped.
    IF p_source = 'online' AND v_phone IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::text || ':' || v_phone, 0));
      SELECT count(*) INTO v_open
        FROM public.bookings b
        JOIN public.anonymous_bookers a ON a.id = b.booker_anon_id
       WHERE b.org_id = p_org_id
         AND a.phone = v_phone
         AND b.source = 'online'  -- only what a guest can create themselves; the club's own desk bookings do not count
         AND b.status = 'pending_payment'
         AND b.ends_at > now();
      IF v_open >= 2 THEN
        RAISE EXCEPTION 'too_many_pending';
      END IF;
    END IF;

    IF v_phone IS NOT NULL THEN
      INSERT INTO public.anonymous_bookers (org_id, name, phone)
      VALUES (p_org_id, btrim(p_guest_name), v_phone)
      ON CONFLICT (org_id, phone) DO UPDATE SET name = EXCLUDED.name
      RETURNING id INTO v_anon_id;
    ELSE
      INSERT INTO public.anonymous_bookers (org_id, name, phone)
      VALUES (p_org_id, btrim(p_guest_name), NULL)
      RETURNING id INTO v_anon_id;
    END IF;

    v_token := encode(gen_random_bytes(24), 'hex');
  END IF;

  INSERT INTO public.bookings (
    org_id, court_id, sport, booker_profile_id, booker_anon_id,
    starts_at, player_count, payment_method, status, guest_cancel_token_hash, pass_token_hash, source
  )
  VALUES (
    p_org_id, p_court_id, p_sport, p_profile_id, v_anon_id,
    p_starts_at, p_player_count, 'cash', p_status,
    CASE WHEN v_token IS NULL THEN NULL ELSE encode(digest(v_token, 'sha256'), 'hex') END,
    CASE WHEN v_pass_token IS NULL THEN NULL ELSE encode(digest(v_pass_token, 'sha256'), 'hex') END,
    p_source
  )
  RETURNING * INTO v_booking;

  IF v_notes IS NOT NULL THEN
    INSERT INTO public.booking_notes (booking_id, org_id, note) VALUES (v_booking.id, p_org_id, v_notes);
  END IF;

  INSERT INTO public.payment_records (booking_id, amount, currency, provider, status, paid_at)
  VALUES (v_booking.id, round(p_amount, 2), 'TND', 'cash',
          CASE WHEN p_paid THEN 'paid' ELSE 'pending' END,
          CASE WHEN p_paid THEN now() ELSE NULL END);

  RETURN jsonb_build_object(
    'booking_id', v_booking.id,
    'reference', upper(substr(replace(v_booking.id::text, '-', ''), 1, 8)),
    'court_id', v_booking.court_id,
    'starts_at', v_booking.starts_at,
    'ends_at', v_booking.ends_at,
    'amount', round(p_amount, 2),
    'cancel_token', v_token,
    'pass_token', coalesce(v_pass_token, v_token),
    'check_in_code', v_booking.check_in_code
  );
END;
$function$;

/* --------------------------- 3. release_stale_bookings() --------------------------- */

-- Cancels upcoming `pending_payment` bookings that were not paid in time, and returns what it cancelled so the
-- caller can notify the bookers. Cancelling is the normal status update, so the existing trigger frees the slot
-- lock and records refunds for anything already paid (an organiser's share of an unpaid split).
--
-- Which bookings count as "waiting for payment" is deliberate:
--   * always: a SPLIT booking with a share still unpaid (the group never finished paying);
--   * only with p_include_guest_cash = true: an unverified GUEST's pay-at-venue booking that nobody marked paid.
-- Plain pay-at-venue bookings are NOT touched by default: in this market most players pay in cash at the club,
-- so they are legitimately "pending" until they arrive. Turn the flag on only once guests are verified (OTP)
-- or the club wants unconfirmed guest bookings to lapse.
--
-- A booking is stale when it is older than p_max_age (30 min) OR starts within p_cutoff (2 h), and never before
-- p_grace (5 min) has passed since it was made, so a payer always has a moment. Started bookings are left alone.
CREATE OR REPLACE FUNCTION public.release_stale_bookings(
  p_max_age interval DEFAULT interval '30 minutes',
  p_cutoff interval DEFAULT interval '2 hours',
  p_grace interval DEFAULT interval '5 minutes',
  p_include_guest_cash boolean DEFAULT false
)
RETURNS TABLE(booking_id uuid, org_id uuid)
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  WITH stale AS (
    SELECT b.id
      FROM public.bookings b
     WHERE b.status = 'pending_payment'
       AND b.starts_at > now()
       AND b.created_at < now() - p_grace
       AND (b.created_at < now() - p_max_age OR b.starts_at < now() + p_cutoff)
       AND (
         EXISTS (SELECT 1 FROM public.booking_shares s WHERE s.booking_id = b.id AND s.status = 'pending')
         OR (p_include_guest_cash AND b.source = 'online' AND b.booker_anon_id IS NOT NULL)
       )
       FOR UPDATE OF b SKIP LOCKED
  ), released AS (
    UPDATE public.bookings u
       SET status = 'cancelled',
           cancellation_reason = 'Payment not completed in time'
     WHERE u.id IN (SELECT id FROM stale)
       AND u.status = 'pending_payment'
    RETURNING u.id, u.org_id
  )
  SELECT r.id, r.org_id FROM released r;
END;
$$;

REVOKE ALL ON FUNCTION public.release_stale_bookings(interval, interval, interval, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_stale_bookings(interval, interval, interval, boolean) TO service_role;
