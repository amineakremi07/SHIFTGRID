-- ShiftGrid Seed Data
-- Test data: 1 organization, 5 courts (3 padel, 1 tennis, 1 football), 2 staff, 3 members

-- ============================================================================
-- SEED ORGANIZATION
-- ============================================================================

INSERT INTO organizations (id, name, address, sport_types, timezone)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'SportCity Tunis',
  '15 Avenue Habib Bourguiba, Tunis 1000, Tunisia',
  ARRAY['padel', 'tennis', 'football'],
  'Africa/Tunis'
);

-- ============================================================================
-- SEED COURTS
-- ============================================================================

-- 3 Padel courts
INSERT INTO courts (id, org_id, sport, name, status, open_time, close_time)
VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'padel', 'Padel Court A', 'active', '08:00', '22:00'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'padel', 'Padel Court B', 'active', '08:00', '22:00'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'padel', 'Padel Court C', 'active', '08:00', '22:00');

-- 1 Tennis court
INSERT INTO courts (id, org_id, sport, name, status, open_time, close_time)
VALUES
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'tennis', 'Tennis Court 1', 'active', '07:00', '21:00');

-- 1 Football terrain
INSERT INTO courts (id, org_id, sport, name, status, open_time, close_time)
VALUES
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'football', 'Football Terrain Nord', 'active', '08:00', '23:00');

-- ============================================================================
-- SEED USERS (via auth.users - requires manual creation or Supabase dashboard)
-- ============================================================================

-- Note: In production, these users would be created via Supabase Auth signup
-- For local testing, manually create these users in Supabase Studio or via SQL:

-- Platform Admin (you)
-- Email: admin@shiftgrid.tn
-- Password: (set manually)

-- Org Admin
-- Email: owner@sportcity.tn
-- Password: (set manually)

-- Staff members
-- Email: staff1@sportcity.tn, staff2@sportcity.tn
-- Password: (set manually)

-- Members
-- Email: member1@sportcity.tn, member2@sportcity.tn, member3@sportcity.tn
-- Password: (set manually)

-- ============================================================================
-- SEED PROFILES (linked to auth.users)
-- ============================================================================

-- IMPORTANT: Replace these UUIDs with actual auth.users IDs after creating users
-- This is just a template structure

-- Platform Admin Profile
-- INSERT INTO profiles (id, org_id, role, display_name, phone)
-- VALUES (
--   'YOUR_PLATFORM_ADMIN_USER_ID',
--   '00000000-0000-0000-0000-000000000001',
--   'platform_admin',
--   'Platform Admin',
--   '+216 20 123 456'
-- );

-- Org Admin Profile
-- INSERT INTO profiles (id, org_id, role, display_name, phone)
-- VALUES (
--   'YOUR_ORG_ADMIN_USER_ID',
--   '00000000-0000-0000-0000-000000000001',
--   'org_admin',
--   'Mohamed Ben Salem',
--   '+216 20 234 567'
-- );

-- Staff Profiles
-- INSERT INTO profiles (id, org_id, role, display_name, phone)
-- VALUES
--   ('YOUR_STAFF1_USER_ID', '00000000-0000-0000-0000-000000000001', 'staff', 'Amir Trabelsi', '+216 20 345 678'),
--   ('YOUR_STAFF2_USER_ID', '00000000-0000-0000-0000-000000000001', 'staff', 'Leila Mansouri', '+216 20 456 789');

-- Member Profiles
-- INSERT INTO profiles (id, org_id, role, display_name, phone)
-- VALUES
--   ('YOUR_MEMBER1_USER_ID', '00000000-0000-0000-0000-000000000001', 'member', 'Ahmed Khalil', '+216 20 567 890'),
--   ('YOUR_MEMBER2_USER_ID', '00000000-0000-0000-0000-000000000001', 'member', 'Sonia Jebali', '+216 20 678 901'),
--   ('YOUR_MEMBER3_USER_ID', '00000000-0000-0000-0000-000000000001', 'member', 'Karim Sassi', '+216 20 789 012');

-- ============================================================================
-- SEED SAMPLE BOOKINGS (optional - for testing)
-- ============================================================================

-- Example: Create a test booking for tomorrow at 10:00
-- Replace 'YOUR_MEMBER1_USER_ID' with actual user ID

-- INSERT INTO bookings (org_id, sport, booker_profile_id, starts_at, player_count, payment_method)
-- VALUES (
--   '00000000-0000-0000-0000-000000000001',
--   'padel',
--   'YOUR_MEMBER1_USER_ID',
--   (NOW() + INTERVAL '1 day')::DATE + TIME '10:00',
--   4,
--   'cash'
-- );

-- The triggers will automatically:
-- 1. Calculate ends_at (10:00 + 1h30 = 11:30)
-- 2. Calculate buffer_ends_at (11:30 + 15min = 11:45)
-- 3. Assign an available padel court
-- 4. Create a court_slot_lock entry
-- 5. Set cancellation_deadline (10:00 - 24h)

-- ============================================================================
-- SEED ANONYMOUS BOOKER (example)
-- ============================================================================

INSERT INTO anonymous_bookers (id, org_id, name, phone)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Youssef Ben Ali',
  '+216 98 123 456'
);

-- Example anonymous booking
-- INSERT INTO bookings (org_id, sport, booker_anon_id, starts_at, player_count, payment_method)
-- VALUES (
--   '00000000-0000-0000-0000-000000000001',
--   'football',
--   '20000000-0000-0000-0000-000000000001',
--   (NOW() + INTERVAL '2 days')::DATE + TIME '18:00',
--   12,
--   'online'
-- );
