-- Milestone 6: platform admin verification (2026-09-30)

-- 1. Why a club was rejected, shown to the owner. Not granted to anon (the public
--    column grants on organizations are an allow-list), so it stays private.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_rejection_reason_len
  CHECK (rejection_reason IS NULL OR char_length(rejection_reason) BETWEEN 1 AND 1000);

-- 2. Private bucket for registration proofs. It did not exist, and the signup code
--    used getPublicUrl, which would have made the proofs world-readable.
--    No storage.objects policies on purpose: only the service role (server
--    actions) can read or write, and admins get short-lived signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('verification-docs', 'verification-docs', false, 5242880,
        ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png'];
