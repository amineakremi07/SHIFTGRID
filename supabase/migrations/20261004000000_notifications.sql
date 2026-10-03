-- Milestone 10: notifications.
--
--  * anonymous_bookers.email: optional. A guest has no account, so this is the only
--    address their confirmation, reminders and cancellation notice can go to.
--  * notifications: an outbox. One row per email the app tries to send, written
--    BEFORE sending and updated with the outcome, so a failure is visible and
--    retryable and a reminder is sent once (the unique dedupe_key).
--
-- Secrets never go in the outbox: pass links carry a guest's secret token and split
-- invite links carry the invitee's, and the database only stores hashes of those on
-- purpose. So `payload` (the template data, used to re-render a retry) is only kept
-- for kinds that contain no secret (cancellation, reminder). Confirmation and invite
-- emails are sent once, from memory, and are not retried.
--
-- Service role only: no client policies, no anon/authenticated grants.

ALTER TABLE public.anonymous_bookers
  ADD COLUMN email text CHECK (email IS NULL OR char_length(email) <= 254);

CREATE TABLE public.notifications (
  id          uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  kind        text NOT NULL CHECK (kind IN ('booking_confirmation', 'split_invite', 'cancellation', 'reminder_2h')),
  booking_id  uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  recipient   text NOT NULL CHECK (char_length(recipient) <= 254),
  subject     text NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempts    integer NOT NULL DEFAULT 0,
  last_error  text,
  provider_id text,
  -- Template data for kinds that may be retried (never contains a secret link).
  payload     jsonb,
  -- Makes "send once" a database guarantee: e.g. 'reminder_2h:<booking id>'.
  dedupe_key  text UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz
);

CREATE INDEX idx_notifications_booking_id ON public.notifications (booking_id);
CREATE INDEX idx_notifications_retry ON public.notifications (status, created_at)
  WHERE status IN ('pending', 'failed');

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.notifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.notifications TO service_role;
