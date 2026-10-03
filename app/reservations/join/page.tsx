import type { Metadata } from 'next'
import Link from 'next/link'

import { JoinPayForm } from '@/components/booking/join-pay-form'
import { formatVenueDate, formatVenueTime, venueDateString } from '@/lib/court-time'
import { findShareInvite } from '@/lib/pass'
import { formatTND, onlinePaymentMode } from '@/lib/payments'

/** The link is a secret: never cached, indexed, or leaked through the referrer. */
export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Pay your share',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[1920px] px-4 py-10 sm:px-6 lg:px-8 xl:px-12">
      <div className="mx-auto max-w-md rounded-xl bg-card p-6">{children}</div>
    </main>
  )
}

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  const invite = await findShareInvite(token)

  // Malformed, unknown and wrong tokens all say the same thing.
  if (!invite) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">This payment link is not valid</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have been replaced by a newer one. Ask the person who booked to send it again.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm underline underline-offset-4">
          Back to ShiftGrid
        </Link>
      </Shell>
    )
  }

  const day = formatVenueDate(venueDateString(new Date(invite.startsAt)))
  const closed = invite.bookingStatus === 'cancelled' || invite.bookingStatus === 'completed'
  const paid = invite.shareStatus === 'paid' || invite.shareStatus === 'refunded'

  return (
    <Shell>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">You are invited to play</p>
      <h1 className="mt-1 text-xl font-semibold">{invite.clubName}</h1>
      <p className="text-sm capitalize text-muted-foreground">
        {invite.courtName} · {invite.sport}
      </p>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">When</dt>
          <dd className="font-medium tabular-nums">
            {day}, {formatVenueTime(invite.startsAt)} – {formatVenueTime(invite.endsAt)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Your share</dt>
          <dd className="font-semibold tabular-nums">{formatTND(invite.amount)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Paid so far</dt>
          <dd className="tabular-nums">
            {invite.paidCount} of {invite.totalShares} players
          </dd>
        </div>
      </dl>

      <div className="mt-6">
        {closed ? (
          <p role="status" className="rounded-lg bg-muted p-3 text-sm">
            This booking was cancelled, so there is nothing to pay.
          </p>
        ) : paid ? (
          <p role="status" className="rounded-lg bg-success/10 p-3 text-sm text-success">
            This share is already paid. See you on court!
          </p>
        ) : (
          <JoinPayForm token={token as string} amount={invite.amount} onlineMode={onlinePaymentMode()} />
        )}
      </div>
    </Shell>
  )
}
