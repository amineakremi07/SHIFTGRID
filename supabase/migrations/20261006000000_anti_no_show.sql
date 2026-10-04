-- V2 anti-no-show: check-in codes, trust score and suspension.
--
--  * profiles: trust_score, no_show_count, is_suspended, suspended_until
--  * bookings: check_in_code (6 digits), checked_in_at, status gains 'no_show'
--    (the column already existed as text + CHECK with default 'pending_payment' for cash
--    bookings; the default is kept on purpose, create_booking decides the real status)
--  * check_in_booking() / mark_booking_no_show(): atomic, service_role only
--  * create_booking(): refuses a suspended member, returns the code
--  * mark_cash_paid(): still works once a booking has been checked in (completed)

-- ---------------------------------------------------------------- profiles ---
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trust_score integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS no_show_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_until timestamptz;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_trust_score_range CHECK (trust_score BETWEEN 0 AND 100),
  ADD CONSTRAINT profiles_no_show_count_nonneg CHECK (no_show_count >= 0);

-- Column-level grants are in force on this table: clients may READ the new columns
-- (RLS still limits rows to the user's own profile / their club's staff) but never write them.
GRANT SELECT (trust_score, no_show_count, is_suspended, suspended_until) ON public.profiles TO authenticated;

-- ---------------------------------------------------------------- bookings ---
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS check_in_code varchar(6),
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_check_in_code_format CHECK (check_in_code IS NULL OR check_in_code ~ '^[0-9]{6}$');

ALTER TABLE public.bookings DROP CONSTRAINT bookings_status_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status = ANY (ARRAY['pending_payment', 'confirmed', 'cancelled', 'completed', 'no_show']::text[]));

-- A player reads their own code; club staff read their club's (RLS). Nobody writes it from a client.
GRANT SELECT (check_in_code, checked_in_at) ON public.bookings TO authenticated;

-- A 6-digit code is only unique among the club's still-open bookings (the ones a
-- receptionist could be asked about today), not globally: there are only a million codes.
CREATE OR REPLACE FUNCTION public.generate_check_in_code(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_code text;
  v_try int := 0;
BEGIN
  LOOP
    v_code := lpad((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');
    v_try := v_try + 1;
    EXIT WHEN v_try >= 25 OR NOT EXISTS (
      SELECT 1 FROM public.bookings
       WHERE org_id = p_org_id
         AND check_in_code = v_code
         AND status IN ('pending_payment', 'confirmed')
         AND ends_at > now() - interval '1 day'
    );
  END LOOP;
  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_check_in_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.check_in_code IS NULL THEN
    NEW.check_in_code := public.generate_check_in_code(NEW.org_id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_check_in_code(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_check_in_code() FROM PUBLIC, anon, authenticated;

-- BEFORE triggers fire alphabetically: after trg_10_set_booking_times and trg_20_assign_court.
CREATE TRIGGER trg_30_check_in_code
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_check_in_code();

-- Bookings that are still open get a code too.
UPDATE public.bookings
   SET check_in_code = public.generate_check_in_code(org_id)
 WHERE check_in_code IS NULL
   AND status IN ('pending_payment', 'confirmed')
   AND ends_at > now() - interval '1 day';

-- ----------------------------------------------------------- create_booking ---
CREATE OR REPLACE FUNCTION public.create_booking(
  p_org_id uuid, p_court_id uuid, p_sport text, p_starts_at timestamptz, p_player_count integer,
  p_amount numeric, p_profile_id uuid DEFAULT NULL, p_guest_name text DEFAULT NULL,
  p_guest_phone text DEFAULT NULL, p_status text DEFAULT 'pending_payment'
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
BEGIN
  IF p_status NOT IN ('pending_payment', 'confirmed') THEN
    RAISE EXCEPTION 'invalid_status';
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
    -- Three no-shows suspend the account for 30 days; the suspension lifts itself afterwards.
    IF v_profile.is_suspended THEN
      IF v_profile.suspended_until IS NULL OR v_profile.suspended_until > now() THEN
        RAISE EXCEPTION 'account_suspended';
      END IF;
      UPDATE public.profiles SET is_suspended = false, suspended_until = NULL WHERE id = p_profile_id;
    END IF;
  ELSE
    IF btrim(coalesce(p_guest_name, '')) = '' OR btrim(coalesce(p_guest_phone, '')) = '' THEN
      RAISE EXCEPTION 'guest_details_required';
    END IF;
    INSERT INTO public.anonymous_bookers (org_id, name, phone)
    VALUES (p_org_id, btrim(p_guest_name), btrim(p_guest_phone))
    ON CONFLICT (org_id, phone) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_anon_id;

    v_token := encode(gen_random_bytes(24), 'hex');
  END IF;

  INSERT INTO public.bookings (
    org_id, court_id, sport, booker_profile_id, booker_anon_id,
    starts_at, player_count, payment_method, status, guest_cancel_token_hash
  )
  VALUES (
    p_org_id, p_court_id, p_sport, p_profile_id, v_anon_id,
    p_starts_at, p_player_count, 'cash', p_status,
    CASE WHEN v_token IS NULL THEN NULL ELSE encode(digest(v_token, 'sha256'), 'hex') END
  )
  RETURNING * INTO v_booking;

  INSERT INTO public.payment_records (booking_id, amount, currency, provider, status)
  VALUES (v_booking.id, round(p_amount, 2), 'TND', 'cash', 'pending');

  RETURN jsonb_build_object(
    'booking_id', v_booking.id,
    'reference', upper(substr(replace(v_booking.id::text, '-', ''), 1, 8)),
    'court_id', v_booking.court_id,
    'starts_at', v_booking.starts_at,
    'ends_at', v_booking.ends_at,
    'amount', round(p_amount, 2),
    'cancel_token', v_token,
    'check_in_code', v_booking.check_in_code
  );
END;
$function$;

-- ---------------------------------------------------------------- mark paid ---
-- A booking checked in at the desk is 'completed' but its cash may still be due:
-- allow collecting it, and never move a completed booking back to 'confirmed'.
CREATE OR REPLACE FUNCTION public.mark_cash_paid(p_booking_id uuid, p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_booking public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_booking FROM public.bookings
   WHERE id = p_booking_id AND org_id = p_org_id FOR UPDATE;
  IF NOT FOUND OR v_booking.status NOT IN ('pending_payment', 'confirmed', 'completed') THEN
    RAISE EXCEPTION 'booking_not_payable';
  END IF;

  UPDATE public.payment_records
     SET status = 'paid', paid_at = now()
   WHERE booking_id = p_booking_id AND provider = 'cash' AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nothing_to_pay';
  END IF;

  IF v_booking.status <> 'completed' THEN
    UPDATE public.bookings SET status = 'confirmed' WHERE id = p_booking_id;
  END IF;
  RETURN jsonb_build_object('booking_id', p_booking_id, 'status', CASE WHEN v_booking.status = 'completed' THEN 'completed' ELSE 'confirmed' END);
END;
$function$;

-- ----------------------------------------------------------------- check in ---
-- Identify a booking by its 6-digit code (scoped to the club, open bookings around now)
-- or by id, then mark it completed. Players may arrive from 60 minutes before the slot
-- until it ends. Errors are plain codes the server maps to messages.
CREATE OR REPLACE FUNCTION public.check_in_booking(p_org_id uuid, p_code text DEFAULT NULL, p_booking_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v public.bookings%ROWTYPE;
  v_id uuid;
  v_n int;
  v_pay public.payment_records%ROWTYPE;
BEGIN
  IF p_booking_id IS NOT NULL THEN
    v_id := p_booking_id;
  ELSIF p_code ~ '^[0-9]{6}$' THEN
    -- Candidates: this club's open bookings with the code around now. If several share
    -- the code, only those inside the check-in window count; still several = ambiguous.
    SELECT count(*) INTO v_n FROM public.bookings
     WHERE org_id = p_org_id AND check_in_code = p_code AND status IN ('pending_payment', 'confirmed')
       AND ends_at > now() - interval '1 day' AND starts_at < now() + interval '2 days';
    IF v_n = 0 THEN
      IF EXISTS (SELECT 1 FROM public.bookings WHERE org_id = p_org_id AND check_in_code = p_code
                   AND status = 'completed' AND checked_in_at > now() - interval '1 day') THEN
        RAISE EXCEPTION 'already_checked_in';
      END IF;
      RAISE EXCEPTION 'booking_not_found';
    ELSIF v_n = 1 THEN
      SELECT id INTO v_id FROM public.bookings
       WHERE org_id = p_org_id AND check_in_code = p_code AND status IN ('pending_payment', 'confirmed')
         AND ends_at > now() - interval '1 day' AND starts_at < now() + interval '2 days';
    ELSE
      SELECT count(*) INTO v_n FROM public.bookings
       WHERE org_id = p_org_id AND check_in_code = p_code AND status IN ('pending_payment', 'confirmed')
         AND now() BETWEEN starts_at - interval '60 minutes' AND ends_at;
      IF v_n <> 1 THEN RAISE EXCEPTION 'ambiguous_code'; END IF;
      SELECT id INTO v_id FROM public.bookings
       WHERE org_id = p_org_id AND check_in_code = p_code AND status IN ('pending_payment', 'confirmed')
         AND now() BETWEEN starts_at - interval '60 minutes' AND ends_at;
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid_input';
  END IF;

  SELECT * INTO v FROM public.bookings WHERE id = v_id AND org_id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  IF v.status = 'completed' THEN RAISE EXCEPTION 'already_checked_in'; END IF;
  IF v.status = 'cancelled' THEN RAISE EXCEPTION 'booking_cancelled'; END IF;
  IF v.status = 'no_show' THEN RAISE EXCEPTION 'booking_no_show'; END IF;
  IF now() < v.starts_at - interval '60 minutes' THEN RAISE EXCEPTION 'too_early'; END IF;
  IF now() > v.ends_at THEN RAISE EXCEPTION 'too_late'; END IF;

  UPDATE public.bookings SET status = 'completed', checked_in_at = now() WHERE id = v.id
  RETURNING * INTO v;

  SELECT * INTO v_pay FROM public.payment_records WHERE booking_id = v.id LIMIT 1;
  RETURN jsonb_build_object(
    'booking_id', v.id,
    'reference', upper(substr(replace(v.id::text, '-', ''), 1, 8)),
    'court_id', v.court_id,
    'starts_at', v.starts_at,
    'ends_at', v.ends_at,
    'checked_in_at', v.checked_in_at,
    'booker_profile_id', v.booker_profile_id,
    'booker_anon_id', v.booker_anon_id,
    'payment_status', v_pay.status,
    'payment_provider', v_pay.provider,
    'amount', v_pay.amount
  );
END;
$function$;

-- ------------------------------------------------------------------ no-show ---
-- Marks an unattended booking as a no-show and applies the penalty to a member:
-- +1 no-show, -30 trust (never below 0), and from the 3rd no-show a 30-day suspension.
-- Allowed 15 minutes after the slot starts, so a late player is not penalised early.
-- Guests have no account, so only the booking is marked.
CREATE OR REPLACE FUNCTION public.mark_booking_no_show(p_org_id uuid, p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v public.bookings%ROWTYPE;
  p public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.bookings WHERE id = p_booking_id AND org_id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;
  IF v.status = 'no_show' THEN RAISE EXCEPTION 'already_no_show'; END IF;
  IF v.status = 'completed' THEN RAISE EXCEPTION 'already_checked_in'; END IF;
  IF v.status = 'cancelled' THEN RAISE EXCEPTION 'booking_cancelled'; END IF;
  IF now() < v.starts_at + interval '15 minutes' THEN RAISE EXCEPTION 'too_early'; END IF;

  UPDATE public.bookings SET status = 'no_show' WHERE id = v.id;

  IF v.booker_profile_id IS NOT NULL THEN
    UPDATE public.profiles
       SET no_show_count = no_show_count + 1,
           trust_score = greatest(trust_score - 30, 0),
           is_suspended = CASE WHEN no_show_count + 1 >= 3 THEN true ELSE is_suspended END,
           suspended_until = CASE WHEN no_show_count + 1 >= 3 THEN now() + interval '30 days' ELSE suspended_until END
     WHERE id = v.booker_profile_id
    RETURNING * INTO p;
  END IF;

  RETURN jsonb_build_object(
    'booking_id', v.id,
    'is_member', v.booker_profile_id IS NOT NULL,
    'no_show_count', p.no_show_count,
    'trust_score', p.trust_score,
    'is_suspended', p.is_suspended,
    'suspended_until', p.suspended_until
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.check_in_booking(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_booking_no_show(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_booking(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_booking_no_show(uuid, uuid) TO service_role;
