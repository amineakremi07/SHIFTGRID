-- Milestone 7: guest self-service cancellation (2026-10-02)
--
-- A guest books without an account, so they need another way to prove the booking
-- is theirs. create_booking() now mints a random 192-bit token for every guest
-- booking and returns it ONCE; only its SHA-256 hash is stored. A leaked database
-- therefore cannot be used to cancel anyone's booking.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS guest_cancel_token_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_guest_cancel_token_hash_key
  ON public.bookings (guest_cancel_token_hash)
  WHERE guest_cancel_token_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_booking(
  p_org_id uuid,
  p_court_id uuid,
  p_sport text,
  p_starts_at timestamptz,
  p_player_count integer,
  p_amount numeric,
  p_profile_id uuid DEFAULT NULL,
  p_guest_name text DEFAULT NULL,
  p_guest_phone text DEFAULT NULL,
  p_status text DEFAULT 'pending_payment'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
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
    'cancel_token', v_token
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_booking(uuid, uuid, text, timestamptz, integer, numeric, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking(uuid, uuid, text, timestamptz, integer, numeric, uuid, text, text, text)
  TO service_role;
