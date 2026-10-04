-- Revocation must stick. Found by a security review of 20261009000000:
--
-- `organization_members` keeps a row for every privileged context an account ever held. If an
-- account was demoted by changing `profiles.role` (e.g. to 'player'), the old row survived, and
-- switch_active_organization() would hand the privileged role back (for a platform admin
-- that means platform_admin again). Two changes:
--
--  1. Fail closed: when a profile's role stops being privileged, ALL of that account's
--     memberships are deleted. (Switching only ever sets privileged roles, so a legitimate
--     switch never triggers this. To revoke ONE club only, delete that membership row.)
--  2. switch_active_organization() also requires the account to hold a privileged role right now,
--     so a stale or hand-inserted row cannot lift a demoted account back up.
--
-- Deliberately NOT added: a separate "platform admin allowlist". A platform_admin membership can
-- only be created by this trigger from a profile that really holds the role, or by a
-- service-role insert; with (1) the row disappears the moment the role does. A second list
-- would be a second source of truth to keep in sync.

CREATE OR REPLACE FUNCTION public.sync_organization_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF NEW.role IN ('org_admin', 'staff', 'platform_admin') THEN
    INSERT INTO public.organization_members (user_id, org_id, role)
    VALUES (NEW.id, NEW.org_id, NEW.role)
    ON CONFLICT (user_id, org_id) DO UPDATE SET role = EXCLUDED.role;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Demoted to a non-privileged role: no privileged context may survive.
    DELETE FROM public.organization_members WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_organization_member() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.switch_active_organization(p_user_id uuid, p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  m public.organization_members%ROWTYPE;
  v_current text;
BEGIN
  SELECT role INTO v_current FROM public.profiles WHERE id = p_user_id;
  IF v_current IS NULL OR v_current NOT IN ('org_admin', 'staff', 'platform_admin') THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  SELECT * INTO m FROM public.organization_members WHERE user_id = p_user_id AND org_id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;
  UPDATE public.profiles SET org_id = m.org_id, role = m.role WHERE id = p_user_id;
  RETURN jsonb_build_object('org_id', m.org_id, 'role', m.role);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.switch_active_organization(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.switch_active_organization(uuid, uuid) TO service_role;
