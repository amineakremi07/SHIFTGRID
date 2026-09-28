-- ShiftGrid — Court pricing + organization city
--
-- The public court pages and the Milestone 4 booking engine both render a
-- per-hour price in TND and display the organization's city. Neither column
-- existed in the initial schema, so those reads returned undefined at runtime.
--
-- Currency note: all monetary values in ShiftGrid are TND (Tunisian Dinar),
-- consistent with payment_records.currency DEFAULT 'TND'.

-- ============================================================================
-- COURTS: per-hour price
-- ============================================================================

ALTER TABLE courts
  ADD COLUMN IF NOT EXISTS price_per_hour NUMERIC(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN courts.price_per_hour IS 'Hourly rate in TND (Tunisian Dinar).';

ALTER TABLE courts
  ADD CONSTRAINT courts_price_per_hour_non_negative
  CHECK (price_per_hour >= 0);

-- ============================================================================
-- ORGANIZATIONS: city
-- ============================================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS city TEXT;

COMMENT ON COLUMN organizations.city IS 'City the complex is located in (e.g. Tunis, Sousse, Sfax).';

CREATE INDEX IF NOT EXISTS idx_organizations_city ON organizations(city);
