-- Fix for 20261010000001, found by scripts/verify-data-retention.mjs (which goes through Supabase's real
-- admin API, unlike the first SQL-only check): `banned_until = 'infinity'` cannot be read by GoTrue
-- (Go's time parser), so loading an anonymized user failed with "Database error loading user" and
-- could break user listing. A ban 100 years ahead is what GoTrue itself writes for a permanent ban.

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

  UPDATE public.bookings
     SET status = 'cancelled', cancellation_reason = 'The player deleted their account'
   WHERE booker_profile_id = p_user_id AND status IN ('pending_payment', 'confirmed') AND ends_at > now();
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  SELECT coalesce(array_agg(id), '{}') INTO v_ids FROM public.bookings WHERE booker_profile_id = p_user_id;
  DELETE FROM public.booking_notes WHERE booking_id = ANY (v_ids);
  UPDATE public.booking_shares SET payer_name = NULL WHERE booking_id = ANY (v_ids);
  UPDATE public.notifications SET recipient = 'deleted@shiftgrid.invalid', payload = NULL WHERE booking_id = ANY (v_ids);

  UPDATE public.profiles
     SET display_name = 'Joueur Anonyme', phone = NULL, avatar_url = NULL, anonymized_at = now()
   WHERE id = p_user_id;

  UPDATE auth.users
     SET email = 'deleted_' || p_user_id::text || '@shiftgrid.invalid',
         phone = NULL,
         encrypted_password = crypt(gen_random_uuid()::text || gen_random_uuid()::text, gen_salt('bf')),
         raw_user_meta_data = '{}'::jsonb,
         raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'anonymized', true),
         banned_until = now() + interval '100 years',
         updated_at = now()
   WHERE id = p_user_id;
  DELETE FROM auth.identities WHERE user_id = p_user_id;
  DELETE FROM auth.sessions WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'bookings_kept', cardinality(v_ids),
    'bookings_cancelled', v_cancelled,
    'no_show_count', v_profile.no_show_count,
    'trust_score', v_profile.trust_score
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.anonymize_player(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymize_player(uuid) TO service_role;

-- Any row anonymized by the first version carries the unreadable value: make it readable.
UPDATE auth.users SET banned_until = now() + interval '100 years' WHERE banned_until = 'infinity';
