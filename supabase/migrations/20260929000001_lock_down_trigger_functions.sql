-- Follow-up to 20260929000000_backend_remediation.sql
--
-- Making the booking trigger functions SECURITY DEFINER exposed them as callable
-- over /rest/v1/rpc. Trigger functions only need EXECUTE at CREATE TRIGGER time
-- (checked against the owner), not when they fire, so no API role needs it.
REVOKE EXECUTE ON FUNCTION public.assign_court()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_court_lock()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_booking_cancellation() FROM PUBLIC, anon, authenticated;

-- Supabase advisor: extensions should not live in the public schema. The GiST
-- exclusion constraint keeps working (it references the operator class by OID).
ALTER EXTENSION btree_gist SET SCHEMA extensions;
