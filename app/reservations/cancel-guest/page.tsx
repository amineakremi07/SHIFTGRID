import Link from 'next/link'

import { GuestCancelForm } from '@/components/booking/guest-cancel-form'
import { formatVenueDate, formatVenueTime, venueDateString } from '@/lib/court-time'
import { findGuestBooking } from '@/lib/guest-cancel'

/** Secret-link page: never cached, never indexed, never leaks the token in a Referer. */
export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Cancel your booking',
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
}

export default async function CancelGuestPage({ searchParams }: { searchParams?: Promise<{ token?: string }> }) {
  const token = (await searchParams)?.token
  const booking = await findGuestBooking(token)

  return (
    <main className="mx-auto w-full max-w-[1920px] px-4 py-10 sm:px-6 lg:px-8 xl:px-12">
      <div className="mx-auto max-w-lg">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ShiftGrid
        </Link>
        <h1 className="mb-6 mt-3 text-3xl font-semibold tracking-tight">Cancel your booking</h1>

        {!booking || !token ? (
          <Notice title="This link is not valid">
            The cancellation link is incomplete or has been mistyped. Open the exact link you saved when you booked, or
            contact the club.
          </Notice>
        ) : (
          <BookingState booking={booking} token={token} />
        )}
      </div>
    </main>
  )
}

function BookingState({
  booking,
  token,
}: {
  booking: NonNullable<Awaited<ReturnType<typeof findGuestBooking>>>
  token: string
}) {
  const now = readClock()
  const start = new Date(booking.startsAt)
  const summary = (
    <dl className="rounded-xl bg-card p-5 text-sm">
      <Row label="Club" value={booking.clubName} />
      <Row label="Court" value={`${booking.courtName} (${booking.sport})`} />
      <Row label="When" value={`${formatVenueDate(venueDateString(start))}, ${formatVenueTime(start)}–${formatVenueTime(booking.endsAt)}`} />
      <Row label="Reference" value={booking.reference} mono />
    </dl>
  )

  if (booking.status === 'cancelled') {
    return (
      <>
        <Notice title="This booking is cancelled" tone="success">
          The slot has been released. Nothing more to do.
        </Notice>
        <div className="mt-4">{summary}</div>
      </>
    )
  }
  if (booking.status === 'completed' || now >= Date.parse(booking.endsAt)) {
    return (
      <>
        <Notice title="This booking has already taken place">There is nothing left to cancel.</Notice>
        <div className="mt-4">{summary}</div>
      </>
    )
  }
  if (now >= Date.parse(booking.cancelDeadline)) {
    return (
      <>
        <Notice title="Free cancellation has closed">
          Bookings can be cancelled online until 24 hours before the start. Please contact {booking.clubName} directly.
        </Notice>
        <div className="mt-4">{summary}</div>
      </>
    )
  }

  return (
    <div className="space-y-5">
      {summary}
      <GuestCancelForm bookingId={booking.id} token={token} />
    </div>
  )
}

/** The request time. A function, so the render body itself stays pure. */
const readClock = () => Date.now()

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-mono' : 'font-medium'}>{value}</dd>
    </div>
  )
}

function Notice({
  title,
  children,
  tone,
}: {
  title: string
  children: React.ReactNode
  tone?: 'success'
}) {
  return (
    <div role="status" className="rounded-xl bg-card px-5 py-6">
      <p className={tone === 'success' ? 'font-semibold text-success' : 'font-semibold'}>{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
