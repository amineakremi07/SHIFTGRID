-- A read-only "pass token" for MEMBER bookings, so the confirmation email's "View your booking pass" button
-- opens the pass without signing in (like a guest's link), WITHOUT giving the link any other power.
--
--  * Guests keep their one secret (`guest_cancel_token_hash`): it shows the pass AND lets them cancel.
--  * Members get `pass_token_hash`: it ONLY shows the pass (check-in code, QR, payment state). It cannot
--    cancel, cannot manage split shares, and is useless on any other booking.
--  * Only the SHA-256 is stored; the token exists in clear once, in the email / on the confirmation screen.
--
-- create_booking() returns `pass_token` for every booking: the member's new token, or the guest's existing one.

ALTER TABLE public.bookings ADD COLUMN pass_token_hash text;
CREATE UNIQUE INDEX bookings_pass_token_hash_key ON public.bookings (pass_token_hash) WHERE pass_token_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_booking(
  p_org_id uuid, p_court_id uuid, p_sport text, p_starts_at timestamptz, p_player_count integer,
  p_amount numeric, p_profile_id uuid DEFAULT NULL, p_guest_name text DEFAULT NULL,
  p_guest_phone text DEFAULT NULL, p_status text DEFAULT 'pending_payment',
  p_source text DEFAULT 'online', p_notes text DEFAULT NULL, p_paid boolean DEFAULT false
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
  v_token text;       -- guests: shows the pass AND cancels
  v_pass_token text;  -- members: shows the pass only
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
