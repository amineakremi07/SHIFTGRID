import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { ArrowLeft, CalendarDays, Clock, ScanLine, Settings2, Users } from 'lucide-react'

import { PassShares } from '@/components/booking/pass-shares'
import { Badge } from '@/components/ui/badge'
import { formatVenueDate, formatVenueTime, venueDateString } from '@/lib/court-time'
import { loadPass, type Pass } from '@/lib/pass'
import { GUEST_TOKEN_PATTERN } from '@/lib/guest-cancel'
import { checkInQrPayload } from '@/lib/check-in-input'
import { SPORT_DURATION_MIN, type Sport } from '@/lib/slot-duration'

/** Personal, and a guest's link carries a secret: never cached, never indexed, never leaked by referrer. */
export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Booking pass',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DOT = { success: 'bg-[#0e634f]', warning: 'bg-[#d9a400]', destructive: 'bg-[#b42318]', secondary: 'bg-[#645757]' } as const
const tnd = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2)} TND`

function statusOf(p: Pass): { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' } {
  if (p.status === 'cancelled') return { label: 'Cancelled', variant: 'destructive' }
  if (p.status === 'completed') return { label: p.checkedInAt ? 'Checked in' : 'Completed', variant: 'secondary' }
  if (p.status === 'no_show') return { label: 'No-show', variant: 'destructive' }
  if (p.status === 'confirmed') return { label: 'Confirmed', variant: 'success' }
  return { label: p.shares.length ? 'Awaiting payments' : 'Pay at the club', variant: 'warning' }
}

function paymentSummary(p: Pass): string {
  if (p.status === 'cancelled') return p.paymentStatus === 'refunded' ? 'Refunded (the club returns what was paid)' : 'Cancelled, nothing owed'
  if (p.paymentStatus === 'paid') return 'Paid in full'
  if (p.shares.length) {
    const paid = p.shares.filter((s) => s.status === 'paid')
    const sum = paid.reduce((t, s) => t + s.amount, 0)
    return `${paid.length} of ${p.shares.length} shares paid (${tnd(sum)} of ${tnd(p.amount)})`
  }
  return 'To pay in cash at the club'
}

export default async function PassPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { id } = await params
  const { token } = await searchParams
  if (!UUID.test(id)) notFound()

  const pass = await loadPass(id, token && GUEST_TOKEN_PATTERN.test(token) ? token : null)
  // Not yours, not found, or a wrong token all look the same.
  if (!pass) notFound()

  const status = statusOf(pass)
  const active = pass.status === 'confirmed' || pass.status === 'pending_payment'
  const day = formatVenueDate(venueDateString(new Date(pass.startsAt)))
  // Only the booker (signed in, or holding the guest link) manages split shares; a read-only pass link does not.
  const organizer = pass.viewer === 'owner' || pass.viewer === 'guest'
  const backHref = pass.viewer === 'staff' ? '/dashboard/org/bookings' : pass.viewer === 'owner' ? '/reservations' : '/'

  // What the QR carries: the check-in code (the club's scanner reads it at reception); older
  // bookings without a code fall back to the reference.
  const qrPayload = pass.checkInCode ? checkInQrPayload(pass.checkInCode) : `shiftgrid:booking:${pass.reference}`
  const durationMin =
    pass.sport in SPORT_DURATION_MIN
      ? SPORT_DURATION_MIN[pass.sport as Sport]
      : Math.round((new Date(pass.endsAt).getTime() - new Date(pass.startsAt).getTime()) / 60000)
  const qr = active ? await QRCode.toString(qrPayload, { type: 'svg', margin: 1, width: 168 }) : null

  return (
    <main className="mx-auto w-full max-w-[1920px] px-4 py-10 sm:px-6 lg:px-8 xl:px-12">
      <div className="mx-auto max-w-xl">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden />
          {pass.viewer === 'staff' ? 'Bookings' : pass.viewer === 'owner' ? 'My reservations' : 'Home'}
        </Link>

        <article aria-labelledby="pass-title" className="mt-4 overflow-hidden rounded-xl bg-card">
          <header className="flex flex-wrap items-start justify-between gap-3 bg-[#1d3023] p-5 text-[#f7f5f2]">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-[#f7f5f2]/70">Booking pass</p>
              <h1 id="pass-title" className="mt-0.5 text-xl font-semibold">
                {pass.clubName}
              </h1>
              <p className="text-sm capitalize text-[#f7f5f2]/80">
                {pass.courtName} · {pass.sport}
              </p>
            </div>
            {/* On the dark header the usual tinted badges lose contrast: a light chip with a status dot. */}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f7f5f2] px-2.5 py-1 text-xs font-medium text-[#1d3023]">
              <span aria-hidden className={`size-2 rounded-full ${DOT[status.variant]}`} />
              {status.label}
            </span>
          </header>

          <div className="space-y-5 p-5">
            {/* ---- hero: what the reception scans or reads ---- */}
            {qr ? (
              <section aria-label="Check-in" className="flex flex-col items-center gap-3 text-center">
                {/* Safe: the SVG is generated by the qrcode library from the booking reference (hex), not from user text. */}
                <div
                  role="img"
                  aria-label={`Check-in QR code for booking ${pass.reference}`}
                  className="size-[200px] shrink-0 rounded-lg bg-white p-1.5 [&>svg]:size-full"
                  dangerouslySetInnerHTML={{ __html: qr }}
                />
                {pass.checkInCode && (
                  <p className="font-mono text-4xl font-bold tracking-[0.3em]" data-testid="check-in-code">
                    {pass.checkInCode}
                  </p>
                )}
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <ScanLine className="size-4" aria-hidden />
                  Show at reception
                </p>
              </section>
            ) : (
              <p className="text-center text-sm text-muted-foreground">This pass is no longer valid.</p>
            )}

            {/* ---- badges: sport, duration, players ---- */}
            <ul aria-label="Booking details" className="flex flex-wrap items-center justify-center gap-1.5">
              <li>
                <Badge variant="secondary" className="capitalize">
                  {pass.sport}
                </Badge>
              </li>
              <li>
                <Badge variant="outline" className="gap-1 tabular-nums">
                  <Clock aria-hidden />
                  {durationMin} min
                </Badge>
              </li>
              <li>
                <Badge variant="outline" className="gap-1">
                  <Users aria-hidden />
                  {pass.playerCount}
                </Badge>
              </li>
            </ul>

            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 rounded-lg bg-background p-3 text-sm">
              <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
              <div>
                <dt className="sr-only">Date</dt>
                <dd className="font-medium">{day}</dd>
              </div>
              <Clock className="size-4 text-muted-foreground" aria-hidden />
              <div>
                <dt className="sr-only">Time</dt>
                <dd className="font-medium tabular-nums">
                  {formatVenueTime(pass.startsAt)} – {formatVenueTime(pass.endsAt)}
                </dd>
              </div>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Ref</span>
              <div>
                <dt className="sr-only">Reference</dt>
                <dd className="font-mono text-lg font-bold tracking-widest" data-testid="reference">
                  {pass.reference}
                </dd>
              </div>
            </dl>

            {pass.status === 'cancelled' && pass.cancellationReason && (
              <p className="text-sm text-muted-foreground">Reason: {pass.cancellationReason}</p>
            )}

            <section aria-labelledby="payment-heading" className="rounded-lg border border-border p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="payment-heading" className="text-sm font-semibold">
                  Payment
                </h2>
                <span className="text-lg font-bold tabular-nums">{tnd(pass.amount)}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground" data-testid="payment-summary">
                {paymentSummary(pass)}
              </p>
              {pass.shares.length > 0 && (
                <div className="mt-3">
                  <PassShares
                    bookingId={pass.id}
                    shares={pass.shares}
                    canManage={organizer && pass.status === 'pending_payment'}
                    guestToken={pass.guestToken}
                  />
                </div>
              )}
            </section>

            {/* ---- manage: every way to change the booking, in one row ---- */}
            {active && ((pass.viewer === 'guest' && pass.guestToken) || pass.viewer === 'pass' || pass.viewer === 'owner') && (
              <nav aria-label="Manage booking" className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
                <Settings2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="font-medium">Manage booking</span>
                <span className="ml-auto flex flex-wrap justify-end gap-x-4 gap-y-1">
                  {pass.viewer === 'guest' && pass.guestToken ? (
                    <Link href={`/reservations/cancel-guest?token=${pass.guestToken}`} className="underline underline-offset-4">
                      Cancel this booking
                    </Link>
                  ) : pass.viewer === 'pass' ? (
                    <Link href="/reservations" className="underline underline-offset-4">
                      Sign in to manage or cancel your booking
                    </Link>
                  ) : (
                    <Link href="/reservations" className="underline underline-offset-4">
                      Manage or cancel in My reservations
                    </Link>
                  )}
                </span>
              </nav>
            )}
          </div>
        </article>
      </div>
    </main>
  )
}
