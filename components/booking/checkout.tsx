'use client'

import * as React from 'react'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { Banknote, Check, CreditCard, FlaskConical, Loader2, Ticket, Users } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { SPRING } from '@/components/ui/motion-button'
import { regenerateShareInviteAction } from '@/lib/actions/payments'
import type { BookingResult } from '@/lib/actions/booking'
import { formatVenueDate, formatVenueTime } from '@/lib/court-time'
import { canSplit, formatTND, splitShares, type OnlineMode, type PaymentChoice } from '@/lib/payments'
import { cn } from '@/lib/utils'

/* ==========================================================================
   Checkout pieces for the booking drawer (Milestone 9): the payment-method
   choice before booking, and the confirmation after it (pass link, split
   invites, guest cancel link).
   ========================================================================== */

const OPTION_META: Record<PaymentChoice, { title: string; icon: typeof CreditCard }> = {
  online_full: { title: 'Pay in full online', icon: CreditCard },
  split: { title: 'Split with your players', icon: Users },
  cash: { title: 'Pay at the venue', icon: Banknote },
}

/** The amount charged right now for a choice (0 for cash). */
export function payNow(choice: PaymentChoice, total: number, playerCount: number): number {
  if (choice === 'online_full') return total
  if (choice === 'split') return splitShares(total, playerCount).organizer
  return 0
}

export function PaymentOptions({
  value,
  onChange,
  total,
  playerCount,
  onlineMode,
  disabled,
}: {
  value: PaymentChoice
  onChange: (choice: PaymentChoice) => void
  total: number
  playerCount: number
  onlineMode: OnlineMode
  disabled?: boolean
}) {
  const online = onlineMode !== 'disabled'
  const splitOk = canSplit(playerCount)
  const shares = splitOk ? splitShares(total, playerCount) : null

  const options: { key: PaymentChoice; available: boolean; detail: React.ReactNode; note?: string }[] = [
    {
      key: 'online_full',
      available: online,
      detail: <>Pay {formatTND(total)} now. Your booking is confirmed straight away.</>,
      note: online ? undefined : 'Online payment is not available yet.',
    },
    {
      key: 'split',
      available: online && splitOk,
      detail: shares ? (
        <>
          Pay your {formatTND(shares.organizer)} share now ({playerCount} players). You get a link for each of the other{' '}
          {playerCount - 1} to pay {formatTND(shares.others)}.
        </>
      ) : (
        <>Pay your share now and send a link to the other players.</>
      ),
      note: !online ? 'Online payment is not available yet.' : !splitOk ? 'Splitting works for up to 4 players.' : undefined,
    },
    {
      key: 'cash',
      available: true,
      detail: <>Pay {formatTND(total)} in cash at the club. Staff confirm your payment when you arrive.</>,
    },
  ]

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium">How would you like to pay?</legend>
      {options.map(({ key, available, detail, note }) => {
        const { title, icon: Icon } = OPTION_META[key]
        const selected = value === key
        return (
          <label
            key={key}
            className={cn(
              'flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors',
              selected ? 'border-forest-depths bg-card' : 'border-border hover:bg-card/60',
              !available && 'cursor-not-allowed opacity-55 hover:bg-transparent'
            )}
          >
            <input
              type="radio"
              name="payment"
              value={key}
              checked={selected}
              disabled={!available}
              onChange={() => onChange(key)}
              className="mt-1 size-4 accent-[#1d3023]"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                {title}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{note ?? detail}</span>
            </span>
          </label>
        )
      })}
      {onlineMode === 'test' && value !== 'cash' && (
        <p className="flex items-start gap-2 rounded-lg bg-accent p-3 text-xs text-accent-foreground">
          <FlaskConical className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            <strong>Test mode:</strong> no real payment gateway is connected, so no money is charged. The payment is
            recorded as paid for testing.
          </span>
        </p>
      )}
    </fieldset>
  )
}

/* ------------------------------- link helpers ------------------------------ */

function useCopy() {
  const [copied, setCopied] = React.useState<string | null>(null)
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000)
    } catch {
      toast.error('Could not copy. Select the link and copy it by hand.')
    }
  }
  return { copied, copy }
}

const absolute = (path: string) => (typeof window === 'undefined' ? path : `${window.location.origin}${path}`)

/** The guest's only way to cancel online, so it is shown prominently and copyable. */
export function GuestCancelLink({ path }: { path: string }) {
  const { copied, copy } = useCopy()
  const url = absolute(path)
  return (
    <div className="rounded-lg border border-border p-4 text-sm">
      <p className="font-medium">Need to cancel? Save this link.</p>
      <p className="mt-1 text-muted-foreground">
        It is the only way to cancel online without an account, free until 24 hours before your slot. Anyone with the
        link can cancel, so keep it private.
      </p>
      <input
        readOnly
        value={url}
        aria-label="Cancellation link"
        onFocus={(e) => e.currentTarget.select()}
        className="mt-3 w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs"
      />
      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => copy('cancel', url)}>
        {copied === 'cancel' ? 'Copied' : 'Copy link'}
      </Button>
    </div>
  )
}

export function InviteLinks({
  invites,
  bookingId,
  guestToken,
}: {
  invites: { shareNo: number; amount: number; path: string }[]
  /** When given, each row can mint a replacement link (pass page). */
  bookingId?: string
  guestToken?: string | null
}) {
  const { copied, copy } = useCopy()
  const [links, setLinks] = React.useState(invites)
  const [busy, setBusy] = React.useState<number | null>(null)

  const regenerate = async (shareNo: number) => {
    if (!bookingId) return
    setBusy(shareNo)
    const res = await regenerateShareInviteAction({ bookingId, shareNo, guestToken: guestToken ?? undefined })
    setBusy(null)
    if (!res.ok) return void toast.error(res.message)
    setLinks((prev) => prev.map((l) => (l.shareNo === shareNo ? { ...l, path: res.path } : l)))
    toast.success('New link created. The old one no longer works.')
  }

  return (
    <ul className="space-y-3">
      {links.map((l) => {
        const url = absolute(l.path)
        return (
          <li key={l.shareNo} className="rounded-lg border border-border p-3 text-sm">
            <p className="font-medium">
              Player {l.shareNo} <span className="font-normal text-muted-foreground">pays {formatTND(l.amount)}</span>
            </p>
            <input
              readOnly
              value={url}
              aria-label={`Payment link for player ${l.shareNo}`}
              onFocus={(e) => e.currentTarget.select()}
              className="mt-2 w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs"
            />
            <div className="mt-2 flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => copy(`s${l.shareNo}`, url)}>
                {copied === `s${l.shareNo}` ? 'Copied' : 'Copy link'}
              </Button>
              {bookingId && (
                <Button type="button" variant="ghost" size="sm" disabled={busy === l.shareNo} onClick={() => regenerate(l.shareNo)}>
                  {busy === l.shareNo && <Loader2 className="animate-spin" aria-hidden />}
                  New link
                </Button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/* ------------------------------- confirmation ------------------------------ */

export function CheckoutConfirmation({
  courtName,
  date,
  result,
  orgName,
  emailedTo = null,
  invitesEmailed = 0,
  onDone,
}: {
  courtName: string
  date: string
  result: Extract<BookingResult, { ok: true }>
  orgName: string
  /** The address a confirmation is being emailed to (only when email is configured). */
  emailedTo?: string | null
  /** How many other players are being emailed their payment link. */
  invitesEmailed?: number
  onDone: () => void
}) {
  const reduce = useReducedMotion()
  const split = result.payment === 'split'
  const confirmed = result.status === 'confirmed'
  const remaining = Math.max(0, result.amount - result.paidNow)

  const headline = confirmed ? 'Booking confirmed' : split ? 'Slot held, waiting for your players' : 'Your slot is reserved'
  const sub = confirmed
    ? `Paid in full. Show this code at ${orgName}.`
    : split
      ? 'It becomes confirmed once every share is paid. Send each player their link below.'
      : `Pay at the club. Show this code at ${orgName}.`

  return (
    <motion.div
      role="status"
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="space-y-5"
    >
      <div className="flex flex-col items-center gap-3 pt-2 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
          <Check className="size-6" aria-hidden />
        </span>
        <div>
          <h3 className="text-xl font-semibold">{headline}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{sub}</p>
        </div>
      </div>

      <div className="rounded-lg bg-card p-4 text-center">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Reference</p>
        <p className="mt-1 font-mono text-3xl font-bold tracking-widest">{result.reference}</p>
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Court</dt>
          <dd className="font-medium">{courtName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">When</dt>
          <dd className="font-medium tabular-nums">
            {formatVenueDate(date)}, {formatVenueTime(result.startsAt)} – {formatVenueTime(result.endsAt)}
          </dd>
        </div>
        {result.paidNow > 0 && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Paid now</dt>
            <dd className="font-semibold tabular-nums">{formatTND(result.paidNow)}</dd>
          </div>
        )}
        {(result.payment === 'cash' || split) && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{split ? 'Still to be paid by your players' : 'To pay at the club'}</dt>
            <dd className="font-semibold tabular-nums">{formatTND(split ? remaining : result.amount)}</dd>
          </div>
        )}
      </dl>

      {(emailedTo || invitesEmailed > 0) && (
        <p className="rounded-lg bg-card p-3 text-sm text-muted-foreground">
          {emailedTo && (
            <>
              A confirmation is on its way to <strong className="text-foreground">{emailedTo}</strong>.{' '}
            </>
          )}
          {invitesEmailed > 0 &&
            `We are also emailing ${invitesEmailed} ${invitesEmailed === 1 ? 'player' : 'players'} their payment link.`}
        </p>
      )}

      {split && result.invites.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Payment links for your players</p>
          <p className="text-xs text-muted-foreground">
            Each link works once. You can find your booking later under My reservations and create a new link if one is
            lost.
          </p>
          <InviteLinks invites={result.invites} />
        </div>
      )}

      {result.cancelPath && <GuestCancelLink path={result.cancelPath} />}

      <div className="grid gap-2">
        <Button asChild variant="outline" className="h-11 w-full">
          <Link href={result.passPath}>
            <Ticket aria-hidden />
            View your pass
          </Link>
        </Button>
        <Button className="h-11 w-full" onClick={onDone}>
          Done
        </Button>
      </div>
    </motion.div>
  )
}
