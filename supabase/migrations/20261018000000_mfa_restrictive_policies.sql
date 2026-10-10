-- Database-level second factor.
--
-- The proxy and the server-side access checks already refuse a password-only (aal1) session whose account has an
-- authenticator. Those checks live in the app, so they do not cover someone who takes their aal1 token and calls the
-- Supabase REST API directly. These RESTRICTIVE policies close that: on the three tables that hold a club's
-- organisation record, API keys and staff invitations, a signed-in user whose account has a VERIFIED TOTP factor
-- gets rows only from an aal2 session.
--
-- RESTRICTIVE policies are AND-ed with the existing permissive ones, so nothing is widened. They apply to the
-- `authenticated` role only: `anon` and the service role are untouched. An account with no verified factor (every
-- ordinary player, and owners who have not turned 2FA on) passes the check at aal1, exactly as before.

-- auth.mfa_factors is not readable by clients, so the check goes through a narrow SECURITY DEFINER function that
-- answers one question about the CALLER only: "do I have a verified authenticator?"
CREATE OR REPLACE FUNCTION public.user_has_verified_totp()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM auth.mfa_factors f
     WHERE f.user_id = (SELECT auth.uid())
       AND f.factor_type = 'totp'
       AND f.status = 'verified'
  );
$$;

REVOKE ALL ON FUNCTION public.user_has_verified_totp() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_verified_totp() TO authenticated, service_role;

-- aal2 session, or no verified factor to step up with. Both sub-selects are wrapped so Postgres evaluates them once
-- per statement rather than once per row.
CREATE POLICY mfa_required_when_enrolled ON public.organizations
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((SELECT auth.jwt() ->> 'aal') = 'aal2') OR NOT (SELECT public.user_has_verified_totp()))
  WITH CHECK (((SELECT auth.jwt() ->> 'aal') = 'aal2') OR NOT (SELECT public.user_has_verified_totp()));

CREATE POLICY mfa_required_when_enrolled ON public.api_keys
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((SELECT auth.jwt() ->> 'aal') = 'aal2') OR NOT (SELECT public.user_has_verified_totp()))
  WITH CHECK (((SELECT auth.jwt() ->> 'aal') = 'aal2') OR NOT (SELECT public.user_has_verified_totp()));

CREATE POLICY mfa_required_when_enrolled ON public.staff_invites
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (((SELECT auth.jwt() ->> 'aal') = 'aal2') OR NOT (SELECT public.user_has_verified_totp()))
  WITH CHECK (((SELECT auth.jwt() ->> 'aal') = 'aal2') OR NOT (SELECT public.user_has_verified_totp()));
