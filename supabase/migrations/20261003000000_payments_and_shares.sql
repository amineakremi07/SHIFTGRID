-- Milestone 9: payments on top of the booking engine.
--
--  * payment_records.provider also accepts 'test' (the sandbox gateway used until a
--    real ClickToPay / Stripe account is wired in; the server only writes it when
--    test payments are enabled).
--  * booking_shares: a split booking is four (or two) shares. The organizer's is
--    paid at booking time, the others are paid later through secret invite links
--    (only the SHA-256 of each token is stored, like guest cancel tokens).
--  * settle_booking_online / create_booking_shares / pay_booking_share /
--    mark_cash_paid: each is ONE transaction that locks the booking row first, so
--    two payers (or a payer and a cancellation) cannot interleave.
--  * Cancelling a booking now marks its paid payment and paid shares `refunded`.
--
-- All new functions are service_role only; the server action derives who may call
-- them (verified session, guest/invite token, or club role) before it does.

-- 1. provider CHECK: add 'test' --------------------------------------------------
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.payment_records'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%provider%'
  LOOP
    EXECUTE format('ALTER TABLE public.payment_records DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.payment_records
  ADD CONSTRAINT payment_records_provider_check
  CHECK (provider IN ('stripe', 'cash', 'clicktopay', 'test'));

-- 2. booking_shares ---------------------------------------------------------------
CREATE TABLE public.booking_shares (
  id               uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  booking_id       uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  share_no         integer NOT NULL CHECK (share_no >= 1),
  amount           numeric(10,2) NOT NULL CHECK (amount >= 0),
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'refunded')),
  is_organizer     boolean NOT NULL DEFAULT false,
  invite_token_hash text,
  payer_name       text CHECK (payer_name IS NULL OR char_length(payer_name) <= 100),
  paid_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, share_no),
  -- the organizer's share has no invite; every other share has one
  CHECK ((is_organizer AND invite_token_hash IS NULL) OR (NOT is_organizer AND invite_token_hash IS NOT NULL))
);

CREATE UNIQUE INDEX booking_shares_invite_token_hash_key
  ON public.booking_shares (invite_token_hash) WHERE invite_token_hash IS NOT NULL;
CREATE INDEX idx_booking_shares_booking_id ON public.booking_shares (booking_id);

CREATE TRIGGER trigger_booking_shares_updated_at
  BEFORE UPDATE ON public.booking_shares
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.booking_shares ENABLE ROW LEVEL SECURITY;

-- Read-only for clients: the booker, the club's owner/staff, platform admins.
-- Nobody can insert, update or delete through the API.
CREATE POLICY "Bookers and club staff can view shares"
  ON public.booking_shares FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_shares.booking_id
        AND (
          b.booker_profile_id = auth.uid()
          OR (b.org_id = public.user_org_id() AND public.user_role() IN ('org_admin', 'staff'))
          OR public.user_role() = 'platform_admin'
        )
    )
  );

REVOKE ALL ON public.booking_shares FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.booking_shares TO authenticated;
GRANT ALL ON public.booking_shares TO service_role;

-- 3. Pay the whole booking online -------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_booking_online(p_booking_id uuid, p_provider text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR v_booking.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'booking_not_payable';
  END IF;

  UPDATE public.payment_records
     SET provider = p_provider, status = 'paid', paid_at = now()
   WHERE booking_id = p_booking_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nothing_to_pay';
  END IF;

  UPDATE public.bookings
     SET status = 'confirmed', payment_method = 'online'
   WHERE id = p_booking_id;

  RETURN jsonb_build_object('booking_id', p_booking_id, 'status', 'confirmed');
END;
$$;

-- 4. Split: create the shares; the organizer pays theirs now -----------------------
CREATE OR REPLACE FUNCTION public.create_booking_shares(
  p_booking_id uuid,
  p_provider text,
  p_share_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_total numeric(10,2);
  v_each numeric(10,2);
  v_token text;
  v_invites jsonb := '[]'::jsonb;
  i integer;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR v_booking.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'booking_not_payable';
  END IF;
  IF p_share_count < 2 OR p_share_count > 4 OR p_share_count <> v_booking.player_count THEN
    RAISE EXCEPTION 'invalid_share_count';
  END IF;
  IF EXISTS (SELECT 1 FROM public.booking_shares WHERE booking_id = p_booking_id) THEN
    RAISE EXCEPTION 'shares_exist';
  END IF;

  SELECT amount INTO v_total FROM public.payment_records
   WHERE booking_id = p_booking_id AND status = 'pending' FOR UPDATE;
  IF v_total IS NULL THEN
    RAISE EXCEPTION 'nothing_to_pay';
  END IF;

  -- Equal shares to the millime-free cent; the organizer absorbs the rounding.
  v_each := trunc(v_total / p_share_count, 2);

  INSERT INTO public.booking_shares (booking_id, share_no, amount, status, is_organizer, paid_at)
  VALUES (p_booking_id, 1, v_total - v_each * (p_share_count - 1), 'paid', true, now());

  FOR i IN 2..p_share_count LOOP
    v_token := encode(gen_random_bytes(24), 'hex');
    INSERT INTO public.booking_shares (booking_id, share_no, amount, invite_token_hash)
    VALUES (p_booking_id, i, v_each, encode(digest(v_token, 'sha256'), 'hex'));
    v_invites := v_invites || jsonb_build_object('share_no', i, 'amount', v_each, 'token', v_token);
  END LOOP;

  UPDATE public.payment_records SET provider = p_provider WHERE booking_id = p_booking_id;
  UPDATE public.bookings SET payment_method = 'online' WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'booking_id', p_booking_id,
    'organizer_amount', v_total - v_each * (p_share_count - 1),
    'invites', v_invites
  );
END;
$$;

-- 5. A friend pays their share through an invite ---------------------------------
CREATE OR REPLACE FUNCTION public.pay_booking_share(
  p_token_hash text,
  p_provider text,
  p_payer_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  v_share public.booking_shares%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
  v_confirmed boolean := false;
BEGIN
  SELECT * INTO v_share FROM public.booking_shares WHERE invite_token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_invite';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = v_share.booking_id FOR UPDATE;
  IF v_booking.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'booking_not_payable';
  END IF;
  IF v_share.status <> 'pending' THEN
    RAISE EXCEPTION 'already_paid';
  END IF;

  UPDATE public.booking_shares
     SET status = 'paid', paid_at = now(), payer_name = nullif(btrim(p_payer_name), '')
   WHERE id = v_share.id;

  IF NOT EXISTS (
    SELECT 1 FROM public.booking_shares WHERE booking_id = v_share.booking_id AND status <> 'paid'
  ) THEN
    UPDATE public.payment_records
       SET status = 'paid', paid_at = now(), provider = p_provider
     WHERE booking_id = v_share.booking_id AND status = 'pending';
    UPDATE public.bookings SET status = 'confirmed' WHERE id = v_share.booking_id;
    v_confirmed := true;
  END IF;

  RETURN jsonb_build_object('booking_id', v_share.booking_id, 'amount', v_share.amount, 'confirmed', v_confirmed);
END;
$$;

-- 6. Staff collect cash at the venue ----------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_cash_paid(p_booking_id uuid, p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_booking FROM public.bookings
   WHERE id = p_booking_id AND org_id = p_org_id FOR UPDATE;
  IF NOT FOUND OR v_booking.status NOT IN ('pending_payment', 'confirmed') THEN
    RAISE EXCEPTION 'booking_not_payable';
  END IF;

  UPDATE public.payment_records
     SET status = 'paid', paid_at = now()
   WHERE booking_id = p_booking_id AND provider = 'cash' AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nothing_to_pay';
  END IF;

  UPDATE public.bookings SET status = 'confirmed' WHERE id = p_booking_id;
  RETURN jsonb_build_object('booking_id', p_booking_id, 'status', 'confirmed');
END;
$$;

-- 7. Cancelling refunds what was paid ---------------------------------------------
-- (Recording only: returning the money is manual until a real gateway is connected.)
CREATE OR REPLACE FUNCTION public.handle_booking_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    DELETE FROM court_slot_locks WHERE booking_id = NEW.id;
    UPDATE payment_records SET status = 'refunded' WHERE booking_id = NEW.id AND status = 'paid';
    UPDATE booking_shares SET status = 'refunded' WHERE booking_id = NEW.id AND status = 'paid';
  END IF;
  RETURN NEW;
END;
$$;

-- 8. Lock the new functions to the server -----------------------------------------
REVOKE ALL ON FUNCTION public.settle_booking_online(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_booking_shares(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pay_booking_share(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_cash_paid(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_booking_online(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_booking_shares(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.pay_booking_share(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_cash_paid(uuid, uuid) TO service_role;

-- The cancellation function is a trigger function: API roles must not run it.
REVOKE ALL ON FUNCTION public.handle_booking_cancellation() FROM PUBLIC, anon, authenticated;
