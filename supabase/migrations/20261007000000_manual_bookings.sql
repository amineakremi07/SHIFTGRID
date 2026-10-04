-- Manual / phone bookings made by club staff.
--
--  * bookings.source ('online' | 'manual' | 'phone') and bookings.notes (staff-only)
--  * anonymous_bookers.phone becomes optional (a desk customer may give a name only)
--  * create_booking() gains p_source, p_notes, p_paid (paid on-site), so the booking,
--    its lock, the guest row and a PAID payment record are one transaction

ALTER TABLE public.bookings
  ADD COLUMN source text NOT NULL DEFAULT 'online',
  ADD COLUMN notes text;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_source_check CHECK (source IN ('online', 'manual', 'phone')),
  ADD CONSTRAINT bookings_notes_check CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 300);

-- Column-level grants are in force: `source` is harmless to read, `notes` is NOT granted
-- (a note such as "owes 20 TND" must never reach the player), staff read it server-side.
GRANT SELECT (source) ON public.bookings TO authenticated;

-- UNIQUE (org_id, phone) stays: NULLs never collide, so name-only guests are separate rows.
ALTER TABLE public.anonymous_bookers ALTER COLUMN phone DROP NOT NULL;

DROP FUNCTION public.create_booking(uuid, uuid, text, timestamptz, integer, numeric, uuid, text, text, text);

CREATE FUNCTION public.create_booking(
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
  v_token text;
  v_phone text := nullif(btrim(coalesce(p_guest_phone, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
BEGIN
  IF p_status NOT IN ('pending_payment', 'confirmed') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;
  IF p_source NOT IN ('online', 'manual', 'phone') THEN
    RAISE EXCEPTION 'invalid_source';
  END IF;
  -- Money taken on the spot only exists for staff-made bookings, and always confirms the slot.
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
  ELSE
    -- A name is always required; the phone only for online guests (staff may take a name only).
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
    starts_at, player_count, payment_method, status, guest_cancel_token_hash, source, notes
  )
  VALUES (
    p_org_id, p_court_id, p_sport, p_profile_id, v_anon_id,
    p_starts_at, p_player_count, 'cash', p_status,
    CASE WHEN v_token IS NULL THEN NULL ELSE encode(digest(v_token, 'sha256'), 'hex') END,
    p_source, v_notes
  )
  RETURNING * INTO v_booking;

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
    'check_in_code', v_booking.check_in_code
  );
END;
$function$;

-- A new function starts with PUBLIC execute: restore "service_role only".
REVOKE ALL ON FUNCTION public.create_booking(uuid, uuid, text, timestamptz, integer, numeric, uuid, text, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking(uuid, uuid, text, timestamptz, integer, numeric, uuid, text, text, text, text, text, boolean) TO service_role;
