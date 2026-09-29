-- Bookings policy polish (2026-09-29)

-- 1. platform_admin can inspect bookings across every organization.
--    (The existing SELECT policy only listed org_admin / staff of the caller's org.)
CREATE POLICY "Platform admins can view all bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (public.user_role() = 'platform_admin');

-- 2. Tighten INSERT. The old policy only checked org_id, so a player could book on
--    behalf of another user, or insert an already-'confirmed' booking.
--    'pending_payment' is the real initial status (there is no 'pending' value in
--    the bookings.status CHECK constraint).
DROP POLICY "Authenticated users can insert bookings in their org" ON public.bookings;

CREATE POLICY "Players can insert their own pending bookings"
  ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (
    public.user_role() = 'player'
    AND org_id = public.user_org_id()
    AND booker_profile_id = auth.uid()
    AND booker_anon_id IS NULL
    AND status = 'pending_payment'
  );

-- Staff and org admins create walk-in / cash bookings (Milestone 5) for guests or
-- members, sometimes already confirmed, so they keep org-scoped insert rights.
CREATE POLICY "Org staff can insert bookings in their org"
  ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.user_org_id()
    AND public.user_role() IN ('org_admin', 'staff')
  );
