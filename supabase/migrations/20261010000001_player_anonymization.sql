-- Hybrid data-retention policy, part 2: ANONYMIZATION of personal data (right to be forgotten).
--
-- A player's account cannot simply be deleted: `bookings.booker_profile_id` must point at someone (the
-- "exactly one booker" CHECK), and a club's accounting, occupancy and the platform's no-show statistics
-- depend on those rows. So the PERSON is erased and the HISTORY stays:
--
--   * `profiles`: display_name -> 'Joueur Anonyme', phone/avatar removed, `anonymized_at` set. The
--     row, its booking links, `no_show_count` and `trust_score` are kept (anonymous statistics).
--   * `auth.users`: the e-mail becomes deleted_<id>@shiftgrid.invalid, the password is replaced by a random
--     hash nobody knows, every identity, session and metadata is removed and the account is banned. The
--     row itself has to remain (profiles.id -> auth.users and bookings -> profiles would otherwise
--     cascade or break the history), but it holds no personal data and nobody can sign in to it.
--   * What else the player's bookings carry about people is erased: staff notes, the organiser's payer
--     name on split shares, and the recipient / payload of notification records.
--   * Upcoming open bookings are cancelled first, so no slot stays held for someone who is gone.
--
-- Only players are anonymized here. Club owners and staff are removed through their own flows.

ALTER TABLE public.profiles ADD COLUMN anonymized_at timestamptz;

CREATE OR REPLACE FUNCTION public.anonymize_player(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth'
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_ids uuid[];
  v_cancelled integer;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;
  IF v_profile.role <> 'player' THEN
    RAISE EXCEPTION 'not_a_player';
  END IF;
  IF v_profile.anonymized_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_anonymized';
  END IF;

  -- 1. Release upcoming bookings (the cancellation trigger frees the slot and records refunds).
  UPDATE public.bookings
     SET status = 'cancelled', cancellation_reason = 'The player deleted their account'
   WHERE booker_profile_id = p_user_id AND status IN ('pending_payment', 'confirmed') AND ends_at > now();
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  -- 2. Personal data hanging off this player's bookings (the bookings themselves stay).
  SELECT coalesce(array_agg(id), '{}') INTO v_ids FROM public.bookings WHERE booker_profile_id = p_user_id;
  DELETE FROM public.booking_notes WHERE booking_id = ANY (v_ids);
  UPDATE public.booking_shares SET payer_name = NULL WHERE booking_id = ANY (v_ids);
  UPDATE public.notifications SET recipient = 'deleted@shiftgrid.invalid', payload = NULL WHERE booking_id = ANY (v_ids);

  -- 3. The profile.
  UPDATE public.profiles
     SET display_name = 'Joueur Anonyme', phone = NULL, avatar_url = NULL, anonymized_at = now()
   WHERE id = p_user_id;

  -- 4. Credentials and identity: no way in, nothing personal left.
  UPDATE auth.users
     SET email = 'deleted_' || p_user_id::text || '@shiftgrid.invalid',
         phone = NULL,
         encrypted_password = crypt(gen_random_uuid()::text || gen_random_uuid()::text, gen_salt('bf')),
         raw_user_meta_data = '{}'::jsonb,
         raw_app_meta_data = jsonb_build_object('anonymized', true),
         banned_until = 'infinity',
         updated_at = now()
   WHERE id = p_user_id;
  DELETE FROM auth.identities WHERE user_id = p_user_id;
  DELETE FROM auth.sessions WHERE user_id = p_user_id; -- refresh tokens go with their sessions

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'bookings_kept', cardinality(v_ids),
    'bookings_cancelled', v_cancelled,
    'no_show_count', v_profile.no_show_count,
    'trust_score', v_profile.trust_score
  );
END;
$$;

-- A guest has no account, only a name / phone / e-mail on `anonymous_bookers`. Same idea: the person goes,
-- the booking history stays.
CREATE OR REPLACE FUNCTION public.anonymize_guest(p_guest_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_ids uuid[];
  v_cancelled integer;
BEGIN
  PERFORM 1 FROM public.anonymous_bookers WHERE id = p_guest_id AND name <> 'Joueur Anonyme' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'guest_not_found';
  END IF;

  UPDATE public.bookings
     SET status = 'cancelled', cancellation_reason = 'The customer asked for their data to be erased'
   WHERE booker_anon_id = p_guest_id AND status IN ('pending_payment', 'confirmed') AND ends_at > now();
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  SELECT coalesce(array_agg(id), '{}') INTO v_ids FROM public.bookings WHERE booker_anon_id = p_guest_id;
  DELETE FROM public.booking_notes WHERE booking_id = ANY (v_ids);
  UPDATE public.booking_shares SET payer_name = NULL WHERE booking_id = ANY (v_ids);
  UPDATE public.notifications SET recipient = 'deleted@shiftgrid.invalid', payload = NULL WHERE booking_id = ANY (v_ids);
  -- The secret cancel link is a credential for this guest: it stops working too.
  UPDATE public.bookings SET guest_cancel_token_hash = NULL WHERE id = ANY (v_ids);

  UPDATE public.anonymous_bookers SET name = 'Joueur Anonyme', phone = NULL, email = NULL WHERE id = p_guest_id;
  RETURN jsonb_build_object('guest_id', p_guest_id, 'bookings_kept', cardinality(v_ids), 'bookings_cancelled', v_cancelled);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.anonymize_player(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.anonymize_guest(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymize_player(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.anonymize_guest(uuid) TO service_role;
