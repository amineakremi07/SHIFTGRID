-- Follow-up to 20261009000001. Moving an account from one club to another (profiles.org_id
-- changes) by any path OTHER than the switcher is a transfer, not a context switch: the old
-- club's membership must go with it, or the account could switch back and regain the old
-- club. The switcher marks its own update with a transaction-local flag so it is not
-- mistaken for a transfer.

CREATE OR REPLACE FUNCTION public.sync_organization_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF NEW.role IN ('org_admin', 'staff', 'platform_admin') THEN
    -- A transfer (organization changed, not by the switcher) ends the old organization's membership.
    IF TG_OP = 'UPDATE'
       AND OLD.org_id IS DISTINCT FROM NEW.org_id
       AND coalesce(current_setting('app.switching', true), '') <> '1' THEN
      DELETE FROM public.organization_members WHERE user_id = NEW.id AND org_id = OLD.org_id;
    END IF;
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

  PERFORM set_config('app.switching', '1', true); -- transaction-local: this update is a switch, not a transfer
  UPDATE public.profiles SET org_id = m.org_id, role = m.role WHERE id = p_user_id;
  PERFORM set_config('app.switching', '', true);
  RETURN jsonb_build_object('org_id', m.org_id, 'role', m.role);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.switch_active_organization(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.switch_active_organization(uuid, uuid) TO service_role;
