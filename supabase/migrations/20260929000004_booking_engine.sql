-- Milestone 4: booking engine (2026-09-29)

-- ============================================================================
-- 1. Night lighting surcharge, data-driven (previously nothing to read it from)
-- ============================================================================
ALTER TABLE public.courts
  ADD COLUMN IF NOT EXISTS night_surcharge_per_hour numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS night_starts_at time NOT NULL DEFAULT '18:00';

ALTER TABLE public.courts
  ADD CONSTRAINT courts_night_surcharge_non_negative CHECK (night_surcharge_per_hour >= 0);

COMMENT ON COLUMN public.courts.night_surcharge_per_hour IS
  'Extra TND per hour for the part of a booking at or after night_starts_at (lighting). 0 = none.';

-- ============================================================================
-- 2. Guest bookers are unique per organization + phone.
--    The guest upsert relied on this, but the constraint never existed.
-- ============================================================================
ALTER TABLE public.anonymous_bookers
  ADD CONSTRAINT anonymous_bookers_org_phone_key UNIQUE (org_id, phone);

-- ============================================================================
-- 3. assign_court must honour a court the player chose.
--    It used to overwrite court_id with the first free court, so picking
--    "Court B at 18:00" could silently book Court A. Now: a supplied court is
--    validated and kept; the GiST constraint on court_slot_locks is the atomic
--    conflict check (SQLSTATE 23P01). With no court supplied it auto-assigns.
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
  IF NEW.court_id IS NOT NULL THEN
    PERFORM 1 FROM courts c
    WHERE c.id = NEW.court_id
      AND c.org_id = NEW.org_id
      AND c.sport = NEW.sport
      AND c.status = 'active';
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

-- ============================================================================
-- 4. create_booking: one transaction for guest record + booking + payment record.
--    The court lock is created by the booking triggers. A double-booking raises
--    SQLSTATE 23P01 from the exclusion constraint and rolls back everything,
--    including the guest upsert (no orphaned guest rows).
--
--    Callable ONLY by the server (service_role): the server action derives the
--    member id from the verified session and computes the amount, so neither
--    can be forged from a browser.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_booking(
  p_org_id uuid,
  p_court_id uuid,
  p_sport text,
  p_starts_at timestamptz,
  p_player_count integer,
  p_amount numeric,
  p_profile_id uuid DEFAULT NULL,
  p_guest_name text DEFAULT NULL,
  p_guest_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_profile public.profiles;
  v_anon_id uuid;
  v_booking public.bookings;
BEGIN
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
  END IF;

  INSERT INTO public.bookings (
    org_id, court_id, sport, booker_profile_id, booker_anon_id,
    starts_at, player_count, payment_method, status
  )
  VALUES (
    p_org_id, p_court_id, p_sport, p_profile_id, v_anon_id,
    p_starts_at, p_player_count, 'cash', 'pending_payment'
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
    'amount', round(p_amount, 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_booking(uuid, uuid, text, timestamptz, integer, numeric, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking(uuid, uuid, text, timestamptz, integer, numeric, uuid, text, text)
  TO service_role;
