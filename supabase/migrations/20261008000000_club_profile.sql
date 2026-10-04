-- Club profile ("vitrine"): bio, photo gallery and the public `club-assets` bucket.
--
-- Already there and reused: `address` (the physical address text), `latitude`/`longitude`
-- (double precision, range + both-or-neither CHECKs, anon-readable), `city`, `name`.

ALTER TABLE public.organizations
  ADD COLUMN description text,
  ADD COLUMN gallery_urls text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_description_len CHECK (description IS NULL OR char_length(description) <= 1000),
  ADD CONSTRAINT organizations_gallery_max CHECK (cardinality(gallery_urls) <= 12);

-- Column-level SELECT is in force on this table (verification fields stay private):
-- the new public-profile columns are readable by visitors (RLS still limits anon to approved clubs).
GRANT SELECT (description, gallery_urls) ON public.organizations TO anon, authenticated;
-- Writes: none from clients. org_admin has no UPDATE on `organizations`; the profile is saved
-- by Server Actions with the service role after a role check (see lib/actions/club-profile.ts).

-- Public bucket: photos are meant to be seen by everyone, through their public URL. There are
-- deliberately NO storage policies: clients can neither list, upload nor delete. Owners upload
-- with one-time signed upload URLs minted by a Server Action that checked their role and club.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('club-assets', 'club-assets', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
