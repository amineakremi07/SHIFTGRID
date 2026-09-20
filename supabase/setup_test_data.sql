-- Complete Test Data Setup - Run this in SQL Editor
-- Creates auth users + profiles + test bookings in one transaction

-- ============================================================================
-- CREATE TEST USERS AND BOOKINGS
-- ============================================================================

DO $$
DECLARE
  member_id UUID;
BEGIN
  -- Create member user in auth
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
  VALUES (
    gen_random_uuid(),
    'member1@sportcity.tn',
    crypt('password123', gen_salt('bf')),
    NOW(),
    '{}'::jsonb
  )
  RETURNING id INTO member_id;

  -- Create identity
  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider)
  VALUES (
    member_id, member_id, member_id,
    '{"email":"member1@sportcity.tn"}'::jsonb,
    'email'
  );

  -- Create profile
  INSERT INTO profiles (id, org_id, role, display_name, phone)
  VALUES (
    member_id,
    '00000000-0000-0000-0000-000000000001',
    'member',
    'Ahmed Khalil',
    '+216 20 567 890'
  );

  -- Disable RLS for bookings
  ALTER TABLE bookings DISABLE ROW LEVEL SECURITY;

  -- Clear existing bookings
  DELETE FROM bookings;

  -- Create test booking
  INSERT INTO bookings (org_id, sport, booker_profile_id, starts_at, player_count, payment_method)
  VALUES (
    '00000000-0000-0000-0000-000000000001',
    'padel',
    member_id,
    '2026-09-10 10:00:00+01'::timestamptz,
    4,
    'cash'
  );

  -- Re-enable RLS
  ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

  RAISE NOTICE 'Created booking with member_id: %', member_id;
  RAISE NOTICE 'Booked court for: 2026-09-10 10:00:00 (90 min padel + 15 min buffer)';
END $$;

-- ============================================================================
-- VERIFY BOOKING
-- ============================================================================

SELECT
  b.id,
  c.name as court,
  b.sport,
  b.status,
  b.starts_at,
  b.ends_at,
  b.cancellation_deadline,
  p.display_name as booker
FROM bookings b
JOIN courts c ON c.id = b.court_id
JOIN profiles p ON p.id = b.booker_profile_id
ORDER BY b.starts_at;
