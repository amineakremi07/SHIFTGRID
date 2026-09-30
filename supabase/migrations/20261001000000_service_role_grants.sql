-- service_role must hold table privileges (2026-10-01)
--
-- The hosted project's service_role had NO privileges on any public table, so every
-- server action using the service-role client (owner signup, bookings, admin
-- verification, walk-ins) failed with "permission denied for table ...".
-- BYPASSRLS skips row-level security only; it does not replace GRANTs.
--
-- service_role is our trusted server identity. anon/authenticated privileges are
-- deliberately left exactly as the earlier migrations set them.

GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Tables, sequences and functions created by later migrations get the same.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
