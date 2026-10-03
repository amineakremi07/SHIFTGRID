-- Milestone 11 hardening. Every write to these tables already goes through
-- server actions with the service role, so the client roles do not need the
-- grants (they were only ever blocked by RLS, or by a too-broad policy).

-- org_admin could rewrite its own verification fields (verified_at, verified_by,
-- rejection_reason, registry_number, verification_documents). Writes are server-only.
REVOKE INSERT, UPDATE ON public.organizations FROM authenticated;

-- Payment state is changed only by service-role RPCs and the cancellation trigger.
REVOKE INSERT, UPDATE ON public.payment_records FROM authenticated;

-- Slot locks are created/removed only by the booking triggers.
REVOKE INSERT, UPDATE ON public.court_slot_locks FROM authenticated;

-- Bookings are not readable by anon (no policy); drop the dead grant.
REVOKE SELECT ON public.bookings FROM anon;

-- Players could insert a pending_payment booking straight through REST, holding a
-- slot with no payment record. Players book only through create_booking().
DROP POLICY IF EXISTS "Players can insert their own pending bookings" ON public.bookings;
