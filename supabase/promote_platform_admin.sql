-- Promote an EXISTING account to platform_admin (run in the Supabase SQL editor).
--
-- Create the user first (Dashboard > Authentication > Users > Add user, tick
-- "Auto confirm"), or use `node scripts/seed-platform-admin.mjs` which does it all.
-- Change the email below.
--
-- profiles.org_id is NOT NULL, so the admin belongs to a hidden organization with
-- status 'suspended': it never appears in the public club list or the player
-- signup dropdown (both only show 'approved' clubs).

DO $$
DECLARE
  v_email  text := 'admin@shiftgrid.local';
  v_user   uuid;
  v_org    uuid;
BEGIN
  SELECT id INTO v_user FROM auth.users WHERE lower(email) = lower(v_email);
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No auth user with email %. Create the user first.', v_email;
  END IF;

  SELECT id INTO v_org FROM public.organizations
   WHERE name = 'ShiftGrid Platform' AND status = 'suspended' LIMIT 1;
  IF v_org IS NULL THEN
    INSERT INTO public.organizations (name, status, sport_types)
    VALUES ('ShiftGrid Platform', 'suspended', '{}')
    RETURNING id INTO v_org;
  END IF;

  INSERT INTO public.profiles (id, org_id, role, display_name)
  VALUES (v_user, v_org, 'platform_admin', 'Platform Admin')
  ON CONFLICT (id) DO UPDATE SET role = 'platform_admin', org_id = EXCLUDED.org_id;

  RAISE NOTICE '% is now platform_admin', v_email;
END $$;
