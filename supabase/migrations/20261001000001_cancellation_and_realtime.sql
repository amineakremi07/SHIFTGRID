-- Milestone 7: cancellation reason + realtime publication (2026-10-01)

-- 1. Optional reason recorded when a booking is cancelled (player or staff).
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_cancellation_reason_len
  CHECK (cancellation_reason IS NULL OR char_length(cancellation_reason) BETWEEN 1 AND 300);

-- 2. Realtime. The supabase_realtime publication was empty, so postgres_changes
--    subscriptions received nothing.
--    * bookings          : staff dashboard (RLS limits events to the caller's club)
--    * court_slot_locks  : the public slot matrix. Readable by anon + authenticated
--                          for active courts of approved clubs, and it is exactly the
--                          row that appears on booking and disappears on cancellation.
--    Row-level security still applies to INSERT/UPDATE events.
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings, public.court_slot_locks;
