-- Performance pass from the 2026-10-08 audit.
-- 1) RLS: evaluate auth.uid() once per statement ((select auth.uid())) instead of once per row
--    (advisor 0003 auth_rls_initplan). ALTER POLICY keeps roles/command; only the expressions change.
-- 2) Cover the two foreign keys the advisor flagged (advisor 0001).
-- 3) club_demand_counts(): the demand badges aggregate in the database instead of loading up to 5000 rows.

-- ---- 1. RLS initplan -------------------------------------------------------------------------------

ALTER POLICY "Users can view their own profile" ON public.profiles
  USING (id = (select auth.uid()));

ALTER POLICY "Users can update their own profile" ON public.profiles
  USING (id = (select auth.uid()));

ALTER POLICY "Users can read their own memberships" ON public.organization_members
  USING (user_id = (select auth.uid()));

ALTER POLICY "Members can view their own bookings" ON public.bookings
  USING (
    org_id = user_org_id()
    AND (booker_profile_id = (select auth.uid()) OR user_role() = ANY (ARRAY['org_admin'::text, 'staff'::text]))
  );

ALTER POLICY "Members can cancel their own bookings before deadline" ON public.bookings
  USING (
    org_id = user_org_id()
    AND booker_profile_id = (select auth.uid())
    AND now() < cancellation_deadline
  );

ALTER POLICY "Bookers and club staff can view shares" ON public.booking_shares
  USING (
    EXISTS (
      SELECT 1
        FROM public.bookings b
       WHERE b.id = booking_shares.booking_id
         AND (
           b.booker_profile_id = (select auth.uid())
           OR (b.org_id = user_org_id() AND user_role() = ANY (ARRAY['org_admin'::text, 'staff'::text]))
           OR user_role() = 'platform_admin'::text
         )
    )
  );

ALTER POLICY "Recipients can view their own invite" ON public.staff_invites
  USING (lower(email) = lower(COALESCE(((select auth.jwt()) ->> 'email'::text), ''::text)));

-- ---- 2. Foreign-key indexes ------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_organizations_verified_by ON public.organizations (verified_by);
CREATE INDEX IF NOT EXISTS idx_staff_invites_invited_by ON public.staff_invites (invited_by);

-- ---- 3. Demand aggregation -------------------------------------------------------------------------

-- Bookings that started in [p_since, p_until], not cancelled, grouped by venue weekday (0 = Sunday) and hour.
-- first_start is the earliest such booking (how many weeks of history the club really has).
-- service_role only: the server action decides which club the caller may ask about.
CREATE OR REPLACE FUNCTION public.club_demand_counts(p_org_id uuid, p_since timestamptz, p_until timestamptz)
RETURNS TABLE (weekday int, hour int, n int, first_start timestamptz)
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  SELECT extract(dow  FROM b.starts_at AT TIME ZONE 'Africa/Tunis')::int  AS weekday,
         extract(hour FROM b.starts_at AT TIME ZONE 'Africa/Tunis')::int  AS hour,
         count(*)::int                                                    AS n,
         min(min(b.starts_at)) OVER ()                                    AS first_start
    FROM public.bookings b
   WHERE b.org_id = p_org_id
     AND b.status <> 'cancelled'
     AND b.starts_at >= p_since
     AND b.starts_at <= p_until
   GROUP BY 1, 2
$$;

REVOKE ALL ON FUNCTION public.club_demand_counts(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.club_demand_counts(uuid, timestamptz, timestamptz) TO service_role;
