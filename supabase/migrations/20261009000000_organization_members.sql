-- Explicit organization memberships and an active-context switch.
--
-- Until now an account was tied to ONE organization through `profiles.org_id` / `profiles.role`.
-- `organization_members` records which organizations an account may act in, and as what.
-- It is the ONLY way an account can be given a second club: there is no global admin
-- bypass, a platform admin has no access to a club unless an explicit row says so.
--
-- `profiles.(org_id, role)` stays the ACTIVE context: every RLS policy and helper
-- (`user_org_id()`, `user_role()`) keeps reading it, so nothing else changes. Only
-- `switch_active_organization()` (service role, called by a Server Action for the verified
-- caller) may move it, and only to a row that exists in `organization_members`.

CREATE TABLE public.organization_members (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- `org_admin` is the club owner. `platform_admin` is the platform context itself (the hidden platform org).
  role text NOT NULL CHECK (role IN ('org_admin', 'staff', 'platform_admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id)
);
CREATE INDEX organization_members_org_id_idx ON public.organization_members (org_id);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- A user may read their own memberships (to draw the switcher). Nobody writes from a client.
CREATE POLICY "Users can read their own memberships"
  ON public.organization_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.organization_members FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;

-- Every account that is (or becomes) a club owner, staff member or platform admin gets the
-- membership of its profile's organization, so signup, staff invites and seeds need no change.
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
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_organization_member() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_sync_organization_member
  AFTER INSERT OR UPDATE OF org_id, role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_organization_member();

-- Existing accounts.
INSERT INTO public.organization_members (user_id, org_id, role)
SELECT id, org_id, role FROM public.profiles WHERE role IN ('org_admin', 'staff', 'platform_admin')
ON CONFLICT DO NOTHING;

-- Move the caller's active context to an organization they are explicitly a member of.
CREATE OR REPLACE FUNCTION public.switch_active_organization(p_user_id uuid, p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  m public.organization_members%ROWTYPE;
BEGIN
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
