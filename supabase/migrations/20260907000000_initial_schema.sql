-- ShiftGrid Initial Schema Migration
-- Multi-tenant sports court booking platform with RLS
-- Currency: TND (Tunisian Dinar)

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ============================================================================
-- TABLES
-- ============================================================================

-- Organizations (multi-tenant anchor)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT,
  sport_types TEXT[] NOT NULL DEFAULT '{}', -- ['padel', 'tennis', 'football']
  timezone TEXT NOT NULL DEFAULT 'Africa/Tunis',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Courts owned by an organization
CREATE TABLE courts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sport TEXT NOT NULL CHECK (sport IN ('padel', 'tennis', 'football')),
  name TEXT NOT NULL, -- Internal label (e.g., "Court A")
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance')),
  open_time TIME NOT NULL DEFAULT '08:00',
  close_time TIME NOT NULL DEFAULT '22:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_courts_org_id ON courts(org_id);
CREATE INDEX idx_courts_sport ON courts(sport);
CREATE INDEX idx_courts_status ON courts(status);

-- Profiles (extends Supabase auth.users with org + role)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('platform_admin', 'org_admin', 'staff', 'member')),
  display_name TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_org_id ON profiles(org_id);
CREATE INDEX idx_profiles_role ON profiles(role);

-- Anonymous bookers (no auth account)
CREATE TABLE anonymous_bookers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_anonymous_bookers_org_id ON anonymous_bookers(org_id);
CREATE INDEX idx_anonymous_bookers_phone ON anonymous_bookers(phone);

-- Bookings (core reservation record)
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  court_id UUID REFERENCES courts(id) ON DELETE SET NULL, -- Assigned by trigger
  sport TEXT NOT NULL CHECK (sport IN ('padel', 'tennis', 'football')),

  -- Booker (either authenticated member or anonymous)
  booker_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  booker_anon_id UUID REFERENCES anonymous_bookers(id) ON DELETE SET NULL,

  -- Time slots (computed by trigger based on sport)
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  buffer_ends_at TIMESTAMPTZ NOT NULL, -- ends_at + 15 min

  -- Booking details
  player_count INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'confirmed', 'cancelled', 'completed')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('online', 'cash')),
  cancellation_deadline TIMESTAMPTZ NOT NULL, -- starts_at - 24 hours

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT booking_has_one_booker CHECK (
    (booker_profile_id IS NOT NULL AND booker_anon_id IS NULL) OR
    (booker_profile_id IS NULL AND booker_anon_id IS NOT NULL)
  ),
  CONSTRAINT valid_player_count CHECK (
    (sport = 'padel' AND player_count = 4) OR
    (sport = 'tennis' AND player_count IN (2, 4)) OR
    (sport = 'football' AND player_count IN (12, 14))
  )
);

CREATE INDEX idx_bookings_org_id ON bookings(org_id);
CREATE INDEX idx_bookings_court_id ON bookings(court_id);
CREATE INDEX idx_bookings_starts_at ON bookings(starts_at);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_booker_profile_id ON bookings(booker_profile_id);
CREATE INDEX idx_bookings_booker_anon_id ON bookings(booker_anon_id);

-- Payment records (one per booking)
CREATE TABLE payment_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TND',
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'cash', 'clicktopay')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'refunded')),
  paid_at TIMESTAMPTZ,
  stripe_intent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_records_booking_id ON payment_records(booking_id);
CREATE INDEX idx_payment_records_status ON payment_records(status);

-- Court slot locks (atomic double-booking prevention)
CREATE TABLE court_slot_locks (
  court_id UUID NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
  occupied_from TIMESTAMPTZ NOT NULL,
  occupied_until TIMESTAMPTZ NOT NULL, -- buffer_ends_at
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  PRIMARY KEY (court_id, occupied_from)
);

-- Exclusion constraint: prevent overlapping time ranges on same court
ALTER TABLE court_slot_locks
ADD CONSTRAINT no_overlap_slots
EXCLUDE USING gist (
  court_id WITH =,
  tstzrange(occupied_from, occupied_until) WITH &&
);

CREATE INDEX idx_court_slot_locks_booking_id ON court_slot_locks(booking_id);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function: Get sport duration in minutes
CREATE OR REPLACE FUNCTION get_sport_duration(sport_type TEXT)
RETURNS INTERVAL AS $$
BEGIN
  RETURN CASE sport_type
    WHEN 'padel' THEN INTERVAL '90 minutes'
    WHEN 'tennis' THEN INTERVAL '60 minutes'
    WHEN 'football' THEN INTERVAL '90 minutes'
    ELSE INTERVAL '60 minutes'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Set booking times automatically
CREATE OR REPLACE FUNCTION set_booking_times()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate ends_at based on sport duration
  NEW.ends_at := NEW.starts_at + get_sport_duration(NEW.sport);

  -- Add 15-minute buffer
  NEW.buffer_ends_at := NEW.ends_at + INTERVAL '15 minutes';

  -- Set cancellation deadline (24 hours before start)
  NEW.cancellation_deadline := NEW.starts_at - INTERVAL '24 hours';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_booking_times
  BEFORE INSERT ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION set_booking_times();

-- Function: Assign available court automatically
CREATE OR REPLACE FUNCTION assign_court()
RETURNS TRIGGER AS $$
DECLARE
  available_court_id UUID;
BEGIN
  -- Find first available court for this sport in this org
  SELECT c.id INTO available_court_id
  FROM courts c
  WHERE c.org_id = NEW.org_id
    AND c.sport = NEW.sport
    AND c.status = 'active'
    AND NOT EXISTS (
      -- Check for overlapping locks
      SELECT 1 FROM court_slot_locks csl
      WHERE csl.court_id = c.id
        AND tstzrange(csl.occupied_from, csl.occupied_until) &&
            tstzrange(NEW.starts_at, NEW.buffer_ends_at)
    )
  LIMIT 1;

  -- If no court available, raise exception
  IF available_court_id IS NULL THEN
    RAISE EXCEPTION 'No available courts for sport % at requested time', NEW.sport;
  END IF;

  -- Assign the court
  NEW.court_id := available_court_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_assign_court
  BEFORE INSERT ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION assign_court();

-- Function: Create court slot lock after booking insert
CREATE OR REPLACE FUNCTION create_court_lock()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert lock record (exclusion constraint will prevent conflicts)
  INSERT INTO court_slot_locks (court_id, occupied_from, occupied_until, booking_id)
  VALUES (NEW.court_id, NEW.starts_at, NEW.buffer_ends_at, NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_court_lock
  AFTER INSERT ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION create_court_lock();

-- Function: Remove court slot lock on cancellation
CREATE OR REPLACE FUNCTION handle_booking_cancellation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    -- Remove the slot lock to free up the court
    DELETE FROM court_slot_locks WHERE booking_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_handle_cancellation
  AFTER UPDATE ON bookings
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled')
  EXECUTE FUNCTION handle_booking_cancellation();

-- Function: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all relevant tables
CREATE TRIGGER trigger_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_courts_updated_at
  BEFORE UPDATE ON courts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_payment_records_updated_at
  BEFORE UPDATE ON payment_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- ROW-LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE courts ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE anonymous_bookers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE court_slot_locks ENABLE ROW LEVEL SECURITY;

-- Helper function: Get user's org_id from JWT
CREATE OR REPLACE FUNCTION public.user_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper function: Get user's role from JWT
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================================
-- RLS POLICIES: organizations
-- ============================================================================

CREATE POLICY "Users can view their own organization"
  ON organizations FOR SELECT
  USING (id = public.user_org_id());

CREATE POLICY "Platform admins can view all organizations"
  ON organizations FOR SELECT
  USING (public.user_role() = 'platform_admin');

CREATE POLICY "Platform admins can insert organizations"
  ON organizations FOR INSERT
  WITH CHECK (public.user_role() = 'platform_admin');

CREATE POLICY "Platform admins can update organizations"
  ON organizations FOR UPDATE
  USING (public.user_role() = 'platform_admin');

-- ============================================================================
-- RLS POLICIES: courts
-- ============================================================================

CREATE POLICY "Users can view courts in their org"
  ON courts FOR SELECT
  USING (org_id = public.user_org_id());

CREATE POLICY "Org admins can insert courts"
  ON courts FOR INSERT
  WITH CHECK (
    org_id = public.user_org_id() AND
    public.user_role() = 'org_admin'
  );

CREATE POLICY "Org admins can update courts"
  ON courts FOR UPDATE
  USING (
    org_id = public.user_org_id() AND
    public.user_role() = 'org_admin'
  );

CREATE POLICY "Org admins can delete courts"
  ON courts FOR DELETE
  USING (
    org_id = public.user_org_id() AND
    public.user_role() = 'org_admin'
  );

-- ============================================================================
-- RLS POLICIES: profiles
-- ============================================================================

CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Org admins can view all profiles in their org"
  ON profiles FOR SELECT
  USING (
    org_id = public.user_org_id() AND
    public.user_role() IN ('org_admin', 'staff')
  );

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Org admins can update profiles in their org"
  ON profiles FOR UPDATE
  USING (
    org_id = public.user_org_id() AND
    public.user_role() = 'org_admin'
  );

-- ============================================================================
-- RLS POLICIES: anonymous_bookers
-- ============================================================================

CREATE POLICY "Org staff can view anonymous bookers"
  ON anonymous_bookers FOR SELECT
  USING (
    org_id = public.user_org_id() AND
    public.user_role() IN ('org_admin', 'staff')
  );

-- Note: INSERT handled by server action (service role)

-- ============================================================================
-- RLS POLICIES: bookings
-- ============================================================================

CREATE POLICY "Members can view their own bookings"
  ON bookings FOR SELECT
  USING (
    org_id = public.user_org_id() AND
    (booker_profile_id = auth.uid() OR public.user_role() IN ('org_admin', 'staff'))
  );

CREATE POLICY "Authenticated users can insert bookings in their org"
  ON bookings FOR INSERT
  WITH CHECK (org_id = public.user_org_id());

CREATE POLICY "Members can cancel their own bookings before deadline"
  ON bookings FOR UPDATE
  USING (
    org_id = public.user_org_id() AND
    booker_profile_id = auth.uid() AND
    NOW() < cancellation_deadline
  )
  WITH CHECK (status = 'cancelled');

CREATE POLICY "Org admins can update any booking in their org"
  ON bookings FOR UPDATE
  USING (
    org_id = public.user_org_id() AND
    public.user_role() IN ('org_admin', 'staff')
  );

-- ============================================================================
-- RLS POLICIES: payment_records
-- ============================================================================

CREATE POLICY "Org admins can view payment records"
  ON payment_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = payment_records.booking_id
        AND b.org_id = public.user_org_id()
        AND public.user_role() IN ('org_admin', 'staff')
    )
  );

CREATE POLICY "Org admins can update payment records"
  ON payment_records FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = payment_records.booking_id
        AND b.org_id = public.user_org_id()
        AND public.user_role() = 'org_admin'
    )
  );

-- ============================================================================
-- RLS POLICIES: court_slot_locks
-- ============================================================================

CREATE POLICY "Users can view slot locks in their org"
  ON court_slot_locks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM courts c
      WHERE c.id = court_slot_locks.court_id
        AND c.org_id = public.user_org_id()
    )
  );

-- Note: INSERT/DELETE handled by triggers (no direct user access needed)

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant usage on schemas
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- Grant permissions on tables
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- Grant permissions on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
