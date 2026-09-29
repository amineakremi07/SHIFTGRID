-- Organization coordinates (2026-09-29)
--
-- The owner signup form already collects a validated latitude/longitude (picked
-- on a map) but the value was only ever put in the admin email, never stored.
-- The public "Nearest to me" club search needs real coordinates.
--
-- Nullable: clubs without a location still list, they just sort last by distance.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS latitude  double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_latitude_range
    CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT organizations_longitude_range
    CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  -- both or neither: half a coordinate is meaningless
  ADD CONSTRAINT organizations_coordinates_pair
    CHECK ((latitude IS NULL) = (longitude IS NULL));

COMMENT ON COLUMN public.organizations.latitude  IS 'Venue latitude (WGS84). Public: shown for distance sorting.';
COMMENT ON COLUMN public.organizations.longitude IS 'Venue longitude (WGS84). Public: shown for distance sorting.';

-- anon reads organizations through column-level grants (see 20260929000000);
-- a venue's location is public by nature, so expose these two.
GRANT SELECT (latitude, longitude) ON public.organizations TO anon;
