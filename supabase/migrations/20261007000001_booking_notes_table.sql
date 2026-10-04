-- Staff notes ("Phone booking", "Desk reservation", "owes 20 TND") must never reach the player.
-- `bookings` has a table-level SELECT grant for `authenticated` (a player reads their own
-- rows), so a `bookings.notes` column would be readable by them. Notes live in their own
-- table instead: RLS on, no policy, no client grant (service role only), like `notifications`.

ALTER TABLE public.bookings DROP CONSTRAINT bookings_notes_check;
ALTER TABLE public.bookings DROP COLUMN notes;

CREATE TABLE public.booking_notes (
  booking_id uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  note text NOT NULL CHECK (char_length(note) BETWEEN 1 AND 300),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_notes_org_id_idx ON public.booking_notes (org_id);

ALTER TABLE public.booking_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_notes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.booking_notes TO service_role;

-- Same signature as before (grants are kept): the note is now written to booking_notes.
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
    starts_at, player_count, payment_method, status, guest_cancel_token_hash, source
  )
  VALUES (
    p_org_id, p_court_id, p_sport, p_profile_id, v_anon_id,
    p_starts_at, p_player_count, 'cash', p_status,
    CASE WHEN v_token IS NULL THEN NULL ELSE encode(digest(v_token, 'sha256'), 'hex') END,
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
    'check_in_code', v_booking.check_in_code
  );
END;
$function$;
