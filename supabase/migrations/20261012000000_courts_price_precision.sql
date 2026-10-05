-- Owners now enter the price of one SLOT (padel/football 90 min, tennis 60 min). The stored rate stays
-- hourly, so it is derived from the slot price (e.g. 50 TND / 90 min = 33.3333 TND/h). Two decimals
-- cannot hold that without drifting a few millimes on the slot total, so widen the column. Lossless:
-- existing values keep their exact value.
ALTER TABLE public.courts
  ALTER COLUMN price_per_hour TYPE NUMERIC(12,4);

COMMENT ON COLUMN public.courts.price_per_hour IS 'Hourly rate in TND, derived from the owner''s per-slot price (4 decimals).';
