-- Per-club WhatsApp contact, stored as digits in international form (e.g. 21698123456, no "+").
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS whatsapp_number text;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_whatsapp_number_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_whatsapp_number_check
  CHECK (whatsapp_number IS NULL OR whatsapp_number ~ '^[1-9][0-9]{7,14}$');

-- Column-level grants are in force on this table: players need it to contact the club.
GRANT SELECT (whatsapp_number) ON public.organizations TO anon, authenticated;
