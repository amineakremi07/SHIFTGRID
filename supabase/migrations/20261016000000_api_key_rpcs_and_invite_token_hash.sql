-- Phase 1 security hardening.
--
-- 1. API-key RPCs become service-role only. They used to read auth.uid() / user_role() and were
--    callable by any signed-in user through /rest/v1/rpc, which bypassed the app's rate limiter
--    (verify_api_key was an unmetered key-guessing oracle). The app now checks the caller with
--    requireOrgAction(['org_admin']) and calls them with the service role, so the functions take
--    the club and the creator explicitly.
-- 2. staff_invites keeps only a SHA-256 hash of the invite token (like every other secret link),
--    so no database reader (platform admin included) can learn a usable token.

/* ---------------------------------- 1. API keys ---------------------------------- */

DROP FUNCTION IF EXISTS public.generate_api_key(uuid, text, text[], integer, timestamptz);
DROP FUNCTION IF EXISTS public.revoke_api_key(uuid);

CREATE FUNCTION public.generate_api_key(
  p_organization_id uuid,
  p_name text,
  p_permissions text[],
  p_rate_limit integer,
  p_expires_at timestamptz,
  p_created_by uuid
)
RETURNS TABLE(id uuid, name text, key text, prefix text, permissions text[], created_at timestamptz)
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  v_key text;
  v_result record;
BEGIN
  v_key := 'sg_live_' || encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.api_keys (
    organization_id, name, key_hash, prefix, permissions, rate_limit, expires_at, created_by
  )
  VALUES (
    p_organization_id, p_name,
    encode(digest(v_key, 'sha256'), 'hex'),
    substring(v_key FROM 1 FOR 12),
    COALESCE(p_permissions, ARRAY['read']::text[]),
    COALESCE(p_rate_limit, 1000),
    p_expires_at,
    p_created_by
  )
  RETURNING * INTO v_result;

  RETURN QUERY SELECT v_result.id, v_result.name, v_key, v_result.prefix, v_result.permissions, v_result.created_at;
END;
$$;

CREATE FUNCTION public.revoke_api_key(p_key_id uuid, p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE public.api_keys
     SET is_active = false
   WHERE id = p_key_id
     AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'API key not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_api_key(uuid, text, text[], integer, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_api_key(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_api_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_api_key(uuid, text, text[], integer, timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_api_key(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_api_key(text) TO service_role;

/* ------------------------------ 2. staff invite tokens ------------------------------ */

ALTER TABLE public.staff_invites ADD COLUMN token_hash text;

-- Open invitations keep working: the emailed link carries the same token, now looked up by its hash.
UPDATE public.staff_invites SET token_hash = encode(extensions.digest(token, 'sha256'), 'hex');

ALTER TABLE public.staff_invites ALTER COLUMN token_hash SET NOT NULL;
CREATE UNIQUE INDEX staff_invites_token_hash_key ON public.staff_invites (token_hash);

DROP INDEX IF EXISTS public.idx_staff_invites_token;
ALTER TABLE public.staff_invites DROP COLUMN token; -- also drops staff_invites_token_key

-- Clients (the recipient, the club owner, platform admins) may still read an invitation's details, never its secret.
REVOKE SELECT ON public.staff_invites FROM anon, authenticated;
GRANT SELECT (id, org_id, email, role, invited_by, expires_at, accepted_at, created_at, updated_at)
  ON public.staff_invites TO authenticated;
