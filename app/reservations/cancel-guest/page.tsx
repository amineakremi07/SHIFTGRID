import Link from 'next/link'

import { GuestCancelForm } from '@/components/booking/guest-cancel-form'
import { formatVenueDate, formatVenueTime, venueDateString } from '@/lib/court-time'
import { findGuestBooking } from '@/lib/guest-cancel'

/** Secret-link page: never cached, never indexed, never leaks the token in a Referer. */
export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Annuler votre réservation',
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
        <h1 className="mb-6 mt-3 text-3xl font-semibold tracking-tight">Annuler votre réservation</h1>

        {!booking || !token ? (
          <Notice title="Ce lien n'est pas valide">
            Le lien d&apos;annulation est incomplet ou mal saisi. Ouvrez exactement le lien que vous avez enregistré lors de la
            réservation, ou contactez le club.
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
      <Row label="Terrain" value={`${booking.courtName} (${booking.sport})`} />
      <Row label="Quand" value={`${formatVenueDate(venueDateString(start))}, ${formatVenueTime(start)}–${formatVenueTime(booking.endsAt)}`} />
      <Row label="Référence" value={booking.reference} mono />
    </dl>
  )

  if (booking.status === 'cancelled') {
    return (
      <>
        <Notice title="Cette réservation est annulée" tone="success">
          Le créneau a été libéré. Il n&apos;y a plus rien à faire.
        </Notice>
        <div className="mt-4">{summary}</div>
      </>
    )
  }
  if (booking.status === 'completed' || now >= Date.parse(booking.endsAt)) {
    return (
      <>
        <Notice title="Cette réservation a déjà eu lieu">Il n&apos;y a plus rien à annuler.</Notice>
        <div className="mt-4">{summary}</div>
      </>
    )
  }
  if (now >= Date.parse(booking.cancelDeadline)) {
    return (
      <>
        <Notice title="L'annulation gratuite est close">
          Les réservations peuvent être annulées en ligne jusqu&apos;à 24 heures avant le début. Veuillez contacter directement {booking.clubName}.
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
