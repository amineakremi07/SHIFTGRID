import { AlertTriangle, ShieldAlert } from 'lucide-react'

import { formatVenueDate, venueDateString } from '@/lib/court-time'

/**
 * Shown on a member's own reservations page once no-shows start to count:
 * a warning from the second one, a suspension notice while one is active.
 * (The third no-show suspends booking for 30 days; the database enforces it.)
 */
export function TrustBanner({
  noShowCount,
  trustScore,
  suspendedUntil,
  now,
}: {
  noShowCount: number
  trustScore: number
  /** Present while a suspension is recorded; ignored once it has passed. */
  suspendedUntil: string | null
  /** The request time in ms, passed in so the render stays pure. */
  now: number
}) {
  const suspended = suspendedUntil !== null && Date.parse(suspendedUntil) > now
  if (!suspended && noShowCount < 2) return null

  if (suspended) {
    return (
      <div role="alert" className="mb-8 flex gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm" data-testid="suspension-banner">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        <div>
          <p className="font-semibold text-destructive">Booking is suspended until {formatVenueDate(venueDateString(new Date(suspendedUntil)))}</p>
          <p className="mt-1">
            You missed {noShowCount} bookings without cancelling, so your account cannot make new bookings for 30 days. Existing bookings are not affected.
            Your trust score is {trustScore}/100.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div role="status" className="mb-8 flex gap-3 rounded-xl border border-[#d9a400]/50 bg-[#d9a400]/10 p-4 text-sm" data-testid="no-show-warning">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[#8a6a00]" aria-hidden />
      <div>
        <p className="font-semibold">You have {noShowCount} no-shows on your account</p>
        <p className="mt-1">
          Your trust score is {trustScore}/100. One more no-show suspends your account from booking for 30 days. If you cannot come, please cancel in time so
          someone else can play.
        </p>
      </div>
    </div>
  )
}
