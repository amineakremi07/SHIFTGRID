-- Test Data Setup Script
-- Run this AFTER the main migration to set up test users and data
-- This script temporarily disables RLS to create test records

-- ============================================================================
-- STEP 1: Create org_admin user (if not exists)
-- ============================================================================

-- First create a test org_admin user in auth
-- REPLACE 'YOUR_ORG_ADMIN_EMAIL' and 'YOUR_PASSWORD' with your values

-- INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at)
-- VALUES (
--   '30000000-0000-0000-0000-000000000001',
--   'YOUR_ORG_ADMIN_EMAIL',
--   crypt('YOUR_PASSWORD', gen_salt('bf')),
--   NOW()
-- );

-- INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
-- VALUES (
--   '30000000-0000-0000-0000-000000000001',
--   '30000000-0000-0000-0000-000000000001',
--   '30000000-0000-0000-0000-000000000001',
--   '{"email":"YOUR_ORG_ADMIN_EMAIL"}'::jsonb,
--   'email',
--   NOW(),
--   NOW()
-- );

-- Then create the org_admin profile
-- INSERT INTO profiles (id, org_id, role, display_name, phone)
-- VALUES (
--   '30000000-0000-0000-0000-000000000001',
--   '00000000-0000-0000-0000-000000000001',
--   'org_admin',
--   'Mohamed Ben Salem',
--   '+216 20 234 567'
-- );

-- ============================================================================
-- STEP 2: Create staff users
-- ============================================================================

-- INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at)
-- VALUES (
--   '30000000-0000-0000-0000-000000000002',
--   'staff1@sportcity.tn',
--   crypt('password123', gen_salt('bf')),
--   NOW()
-- );

-- INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
-- VALUES (
--   '30000000-0000-0000-0000-000000000002',
--   '30000000-0000-0000-0000-000000000002',
--   '30000000-0000-0000-0000-000000000002',
--   '{"email":"staff1@sportcity.tn"}'::jsonb,
--   'email',
--   NOW(),
--   NOW()
-- );

-- INSERT INTO profiles (id, org_id, role, display_name, phone)
-- VALUES (
--   '30000000-0000-0000-0000-000000000002',
--   '00000000-0000-0000-0000-000000000001',
--   'staff',
--   'Amir Trabelsi',
--   '+216 20 345 678'
-- );

-- ============================================================================
-- STEP 3: Create member users
-- ============================================================================

-- Member 1
-- INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at)
-- VALUES (
--   '30000000-0000-0000-0000-000000000003',
--   'member1@sportcity.tn',
--   crypt('password123', gen_salt('bf')),
--   NOW()
-- );

-- INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
-- VALUES (
--   '30000000-0000-0000-0000-000000000003',
--   '30000000-0000-0000-0000-000000000003',
--   '30000000-0000-0000-0000-000000000003',
--   '{"email":"member1@sportcity.tn"}'::jsonb,
--   'email',
--   NOW(),
--   NOW()
-- );

-- INSERT INTO profiles (id, org_id, role, display_name, phone)
-- VALUES (
--   '30000000-0000-0000-0000-000000000003',
--   '00000000-0000-0000-0000-000000000001',
--   'member',
--   'Ahmed Khalil',
--   '+216 20 567 890'
-- );

-- ============================================================================
-- STEP 4: Disable RLS, Insert test bookings, Re-enable RLS
-- ============================================================================

-- Temporarily disable RLS for testing
ALTER TABLE bookings DISABLE ROW LEVEL SECURITY;

-- Clear existing bookings if any
DELETE FROM bookings;

-- Create test bookings
INSERT INTO bookings (org_id, sport, booker_profile_id, starts_at, player_count, payment_method)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'padel',
    '30000000-0000-0000-0000-000000000003',  -- member1
    '2026-09-10 10:00:00+01'::timestamptz,
    4,
    'cash'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'football',
    '30000000-0000-0000-0000-000000000003',  -- member1
    '2026-09-11 18:00:00+01'::timestamptz,
    12,
    'online'
  );

-- Re-enable RLS
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Verify
SELECT b.id, c.name as court, b.sport, b.status, b.starts_at, b.ends_at
FROM bookings b
JOIN courts c ON c.id = b.court_id
ORDER BY b.starts_at;