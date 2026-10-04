'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Banknote, CheckCircle2, Loader2, Phone, PhoneCall, Plus, ScanLine, User, UserRound, UserX, X } from 'lucide-react'
import { toast } from 'sonner'

import { CheckInDialog, postCheckIn } from '@/components/dashboard/check-in-dialog'
import { ManualBookingDialog, type ManualBookingPreset } from '@/components/dashboard/manual-booking-dialog'
import { DayPicker } from '@/components/courts/day-picker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useRealtimeBookings } from '@/hooks/use-realtime-bookings'
import { cancelBookingAction } from '@/lib/actions/bookings'
import { markNoShowAction } from '@/lib/actions/org-bookings'
import { markCashPaidAction } from '@/lib/actions/payments'
import { formatVenueTime } from '@/lib/court-time'
import { SPORT_DURATION_MIN, type Sport } from '@/lib/slot-duration'
import type { BookingSource, BookingStatus, PaymentProvider, PaymentStatus } from '@/lib/types/database'
import { cn } from '@/lib/utils'

export type BoardSlot = { start: string; end: string; past: boolean }

export type BoardCourt = {
  id: string
  name: string
  sport: Sport
  status: 'active' | 'maintenance'
  pricePerHour: number
  nightSurchargePerHour: number
  nightStartsAt: string
  /** The club is closed that day. */
  closed: boolean
  slots: BoardSlot[]
}

export type BoardBooking = {
  id: string
  courtId: string | null
  startsAt: string
  endsAt: string
  status: BookingStatus
  playerCount: number
  bookerName: string
  bookerPhone: string | null
  isMember: boolean
  amount: number | null
  /** The payment record, when there is one. */
  paymentStatus: PaymentStatus | null
  paymentProvider: PaymentProvider | null
  reference: string
  /** When the player was checked in at reception (status completed). */
  checkedInAt: string | null
  /** Made online by the player, or by staff at the desk / on the phone. */
  source: BookingSource
  /** Staff-only note from a manual booking (never sent to the player). */
  note: string | null
  /** Members only: their no-show history, so staff see who is risky. */
  noShowCount: number | null
  trustScore: number | null
}

const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: 'Confirmed',
  pending_payment: 'Pending',
  cancelled: 'Cancelled',
  completed: 'Checked in',
  no_show: 'No-show',
}
const STATUS_VARIANT: Record<BookingStatus, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  confirmed: 'success',
  pending_payment: 'warning',
  cancelled: 'destructive',
  completed: 'secondary',
  no_show: 'destructive',
}

const tnd = (n: number) => `${n.toFixed(2)} TND`
const isOpen = (b: BoardBooking) => b.status === 'pending_payment' || b.status === 'confirmed'

/** Players may check in from an hour before the slot until it ends; a no-show can be recorded 15 min after it starts. */
const CHECK_IN_LEAD_MS = 60 * 60_000
const NO_SHOW_AFTER_MS = 15 * 60_000

export function BookingsBoard({
  orgId,
  dateStr,
  today,
  minDate,
  maxDate,
  courts,
  bookings,
}: {
  orgId: string
  dateStr: string
  today: string
  minDate: string
  maxDate: string
  courts: BoardCourt[]
  bookings: BoardBooking[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = React.useTransition()
  const [manualOpen, setManualOpen] = React.useState(false)
  const [manualPreset, setManualPreset] = React.useState<ManualBookingPreset>(null)
  const [toCancel, setToCancel] = React.useState<BoardBooking | null>(null)
  const [toNoShow, setToNoShow] = React.useState<BoardBooking | null>(null)
  const [checkInOpen, setCheckInOpen] = React.useState(false)
  // The buttons that depend on "now" are re-evaluated every 30 s (the render itself stays pure).
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  // Live: online bookings, other staff's walk-ins and cancellations refresh the day.
  useRealtimeBookings(orgId, dateStr, () => router.refresh())

  // Safety net in case realtime is blocked (corporate proxies, sleeping laptops).
  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, 120_000)
    return () => window.clearInterval(id)
  }, [router])

  const changeDate = (next: string) =>
    startTransition(() => router.push(`${pathname}?date=${next}`, { scroll: false }))

  const open = bookings.filter(isOpen)
  const cancelled = bookings.filter((b) => b.status === 'cancelled')
  // Checked-in and no-show bookings stay on the schedule (they still occupy their slot).
  const onSchedule = bookings.filter((b) => b.status !== 'cancelled')
  const revenue = open.reduce((sum, b) => sum + (b.amount ?? 0), 0)
  const courtName = (id: string | null) => courts.find((c) => c.id === id)?.name ?? 'Removed court'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Daily schedule</h2>
          <p className="text-sm text-[#645757]">Tap a free slot, or use Add Manual Booking, for a desk or phone customer.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => {
              setManualPreset(null)
              setManualOpen(true)
            }}
            className="bg-[#1d3023] text-[#f7f5f2] hover:bg-[#1d3023]/90"
          >
            <PhoneCall aria-hidden /> Add Manual Booking
          </Button>
          <Button variant="outline" onClick={() => setCheckInOpen(true)}>
            <ScanLine aria-hidden /> Check-in player
          </Button>
          <DayPicker dateStr={dateStr} minDate={minDate} maxDate={maxDate} onChange={changeDate} pending={pending} />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Confirmed" value={String(open.filter((b) => b.status === 'confirmed').length)} />
        <Stat label="Pending" value={String(open.filter((b) => b.status === 'pending_payment').length)} />
        <Stat label="Cancelled" value={String(cancelled.length)} />
        <Stat label="Expected revenue" value={tnd(revenue)} />
      </dl>

      <div className={cn('space-y-6 transition-opacity', pending && 'opacity-60')} aria-busy={pending}>
        {courts.length === 0 ? (
          <div className="rounded-xl bg-[#eae6df] px-6 py-12 text-center">
            <p className="text-lg font-semibold">No courts yet</p>
            <p className="mt-1 text-sm text-[#645757]">Add courts under Courts to start taking bookings.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5">
            {courts.map((court) => (
              <CourtColumn
                key={court.id}
                court={court}
                bookings={onSchedule.filter((b) => b.courtId === court.id)}
                now={now}
                onWalkIn={(slot) => {
                  setManualPreset({ courtId: court.id, startsAt: slot.start })
                  setManualOpen(true)
                }}
                onCancel={setToCancel}
                onNoShow={setToNoShow}
              />
            ))}
          </div>
        )}

        {cancelled.length > 0 && (
          <section aria-labelledby="cancelled-heading" className="rounded-xl bg-[#eae6df] p-5">
            <h3 id="cancelled-heading" className="text-sm font-semibold">
              Cancelled ({cancelled.length})
            </h3>
            <ul className="mt-3 divide-y divide-[#d7d2cc] text-sm">
              {cancelled.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-[#645757]">
                  <span className="tabular-nums">
                    {formatVenueTime(b.startsAt)}–{formatVenueTime(b.endsAt)}
                  </span>
                  <span>{courtName(b.courtId)}</span>
                  <span>{b.bookerName}</span>
                  <span className="font-mono text-xs">{b.reference}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <ManualBookingDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        preset={manualPreset}
        courts={courts}
        bookings={bookings}
        dateStr={dateStr}
        today={today}
        maxDate={maxDate}
        onDateChange={changeDate}
        datePending={pending}
        onBooked={() => router.refresh()}
      />

      <CancelDialog
        booking={toCancel}
        onClose={() => setToCancel(null)}
        onDone={() => {
          setToCancel(null)
          router.refresh()
        }}
      />

      <NoShowDialog
        booking={toNoShow}
        onClose={() => setToNoShow(null)}
        onDone={() => {
          setToNoShow(null)
          router.refresh()
        }}
      />

      <CheckInDialog open={checkInOpen} onOpenChange={setCheckInOpen} />

      <span className="sr-only" aria-live="polite">
        {today === dateStr ? 'Showing today' : `Showing ${dateStr}`}
      </span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#eae6df] px-4 py-3">
      <dt className="text-xs text-[#645757]">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function CourtColumn({
  court,
  bookings,
  now,
  onWalkIn,
  onCancel,
  onNoShow,
}: {
  court: BoardCourt
  bookings: BoardBooking[]
  now: number
  onWalkIn: (slot: BoardSlot) => void
  onCancel: (b: BoardBooking) => void
  onNoShow: (b: BoardBooking) => void
}) {
  const byStart = new Map(bookings.map((b) => [Date.parse(b.startsAt), b]))
  const slotStarts = new Set(court.slots.map((s) => Date.parse(s.start)))
  // A booking whose time is no longer on the grid (hours changed since) must stay visible.
  const offGrid = bookings.filter((b) => !slotStarts.has(Date.parse(b.startsAt)))

  return (
    <section className="rounded-xl bg-[#eae6df] p-4" aria-label={court.name}>
      <header className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{court.name}</h3>
          <p className="text-xs capitalize text-[#645757]">
            {court.sport} · {SPORT_DURATION_MIN[court.sport]} min
          </p>
        </div>
        {court.status === 'maintenance' && <Badge variant="warning">Maintenance</Badge>}
      </header>

      {court.closed ? (
        <p className="rounded-lg bg-[#f7f5f2] px-3 py-4 text-center text-sm text-[#645757]">Club closed this day</p>
      ) : (
        <ul className="space-y-2">
          {offGrid.map((b) => (
            <BookingRow key={b.id} booking={b} now={now} onCancel={onCancel} onNoShow={onNoShow} />
          ))}
          {court.slots.map((slot) => {
            const booking = byStart.get(Date.parse(slot.start))
            if (booking) return <BookingRow key={slot.start} booking={booking} now={now} onCancel={onCancel} onNoShow={onNoShow} />
            const blocked = slot.past || court.status !== 'active'
            return (
              <li key={slot.start}>
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => onWalkIn(slot)}
                  className="flex w-full items-center justify-between rounded-lg border border-dashed border-[#d7d2cc] bg-[#f7f5f2] px-3 py-2.5 text-left text-sm transition-colors enabled:hover:border-[#1d3023] disabled:opacity-50"
                >
                  <span className="tabular-nums">
                    {formatVenueTime(slot.start)}–{formatVenueTime(slot.end)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[#645757]">
                    {slot.past ? 'Past' : court.status !== 'active' ? 'Unavailable' : (
                      <>
                        <Plus className="size-3.5" aria-hidden /> Walk-in
                      </>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
          {court.slots.length === 0 && offGrid.length === 0 && (
            <li className="text-sm text-[#645757]">No slots this day.</li>
          )}
        </ul>
      )}
    </section>
  )
}

function paymentLabel(b: BoardBooking): { text: string; paid: boolean } | null {
  if (b.paymentStatus === 'paid') return { text: b.paymentProvider === 'cash' ? 'Paid in cash' : 'Paid online', paid: true }
  if (b.paymentStatus === 'refunded') return { text: 'Refunded', paid: false }
  if (b.paymentStatus === 'pending') {
    return { text: b.paymentProvider === 'cash' ? 'Cash due' : 'Awaiting shares', paid: false }
  }
  return null
}

function BookingRow({
  booking,
  now,
  onCancel,
  onNoShow,
}: {
  booking: BoardBooking
  now: number
  onCancel: (b: BoardBooking) => void
  onNoShow: (b: BoardBooking) => void
}) {
  const router = useRouter()
  const [collecting, setCollecting] = React.useState(false)
  const [checkingIn, setCheckingIn] = React.useState(false)
  const start = Date.parse(booking.startsAt)
  const end = Date.parse(booking.endsAt)
  const canCheckIn = isOpen(booking) && now >= start - CHECK_IN_LEAD_MS && now <= end
  const canNoShow = isOpen(booking) && now >= start + NO_SHOW_AFTER_MS

  const checkIn = async () => {
    setCheckingIn(true)
    const result = await postCheckIn(booking.id)
    setCheckingIn(false)
    if (!result.ok) toast.error(result.message)
    else toast.success(`${result.booker} is checked in.${result.cashDue > 0 ? ` Collect ${result.cashDue.toFixed(2)} TND.` : ''}`)
    router.refresh()
  }
  const payment = paymentLabel(booking)
  // Only cash is collected here; online and split payments settle themselves.
  // Cash can still be collected after check-in (the booking is then 'completed').
  const canCollect = (isOpen(booking) || booking.status === 'completed') && booking.paymentStatus === 'pending' && booking.paymentProvider === 'cash'

  const collect = async () => {
    setCollecting(true)
    const result = await markCashPaidAction(booking.id)
    setCollecting(false)
    if (!result.ok) {
      toast.error(result.message)
      router.refresh()
      return
    }
    toast.success('Payment recorded. The booking is confirmed.')
    router.refresh()
  }

  return (
    <li className="rounded-lg bg-[#f7f5f2] px-3 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium tabular-nums">
          {formatVenueTime(booking.startsAt)}–{formatVenueTime(booking.endsAt)}
        </span>
        <Badge variant={STATUS_VARIANT[booking.status]}>{STATUS_LABEL[booking.status]}</Badge>
      </div>
      <p className="mt-1 flex items-center gap-1.5">
        {booking.isMember ? <User className="size-3.5" aria-hidden /> : <UserRound className="size-3.5" aria-hidden />}
        <span className="truncate">{booking.bookerName}</span>
        <span className="text-[#645757]">· {booking.playerCount} players</span>
      </p>
      {booking.note && <p className="mt-1 truncate text-xs italic text-[#645757]" title={booking.note}>“{booking.note}”</p>}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-[#645757]">
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {booking.bookerPhone && (
            <>
              <Phone className="size-3" aria-hidden />
              {booking.bookerPhone}
            </>
          )}
          <span className="font-mono">{booking.reference}</span>
          {booking.source !== 'online' && (
            <span className="rounded-sm bg-[#1d3023]/10 px-1 font-medium text-[#1d3023]">{booking.source === 'phone' ? 'Phone' : 'Desk'}</span>
          )}
          {booking.checkedInAt && <span className="font-medium text-[#0e634f]">· in at {formatVenueTime(booking.checkedInAt)}</span>}
          {booking.noShowCount !== null && booking.noShowCount > 0 && (
            <span className="rounded-sm bg-destructive/10 px-1 font-medium text-destructive" title="Member trust score and no-shows">
              Trust {booking.trustScore} · {booking.noShowCount} no-show{booking.noShowCount === 1 ? '' : 's'}
            </span>
          )}
          {booking.amount !== null && <span>· {tnd(booking.amount)}</span>}
          {payment && (
            <span className={cn('rounded-sm px-1 font-medium', payment.paid ? 'bg-success/10 text-success' : 'bg-[#eae6df]')}>
              {payment.text}
            </span>
          )}
        </span>
        <span className="inline-flex gap-1.5">
          {canCollect && (
            <Button variant="outline" size="xs" onClick={collect} disabled={collecting}>
              {collecting ? <Loader2 className="animate-spin" aria-hidden /> : <Banknote aria-hidden />} Mark paid
            </Button>
          )}
          {canCheckIn && (
            <Button variant="outline" size="xs" onClick={checkIn} disabled={checkingIn}>
              {checkingIn ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />} Check in
            </Button>
          )}
          {canNoShow && (
            <Button variant="outline" size="xs" onClick={() => onNoShow(booking)}>
              <UserX aria-hidden /> No-show
            </Button>
          )}
          {isOpen(booking) && (
            <Button variant="destructive" size="xs" onClick={() => onCancel(booking)}>
              <X aria-hidden /> Cancel
            </Button>
          )}
        </span>
      </div>
    </li>
  )
}

function CancelDialog({
  booking,
  onClose,
  onDone,
}: {
  booking: BoardBooking | null
  onClose: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = React.useState(false)
  const [reason, setReason] = React.useState('')

  const confirm = async () => {
    if (!booking) return
    setBusy(true)
    const result = await cancelBookingAction({ bookingId: booking.id, reason })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.message)
      onDone() // the booking may already be gone; show the real state
      return
    }
    toast.success('Booking cancelled. The slot is free again.')
    setReason('')
    onDone()
  }

  return (
    <Dialog open={booking !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#eae6df] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cancel this booking?</DialogTitle>
          <DialogDescription>
            {booking &&
              `${booking.bookerName} · ${formatVenueTime(booking.startsAt)}–${formatVenueTime(booking.endsAt)} · ${booking.reference}. The slot becomes bookable again immediately.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="cancel-reason">Reason (optional)</Label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="e.g. Customer called to cancel"
          />
        </div>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" onClick={onClose}>
            Keep booking
          </Button>
          <Button variant="destructive" disabled={busy} onClick={confirm}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            Cancel booking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NoShowDialog({
  booking,
  onClose,
  onDone,
}: {
  booking: BoardBooking | null
  onClose: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = React.useState(false)

  const confirm = async () => {
    if (!booking) return
    setBusy(true)
    const result = await markNoShowAction(booking.id)
    setBusy(false)
    if (!result.ok) toast.error(result.message)
    else toast.success(result.message)
    onDone()
  }

  return (
    <Dialog open={booking !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#eae6df] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark as no-show?</DialogTitle>
          <DialogDescription>
            {booking &&
              `${booking.bookerName} · ${formatVenueTime(booking.startsAt)}–${formatVenueTime(booking.endsAt)} · ${booking.reference}. `}
            {booking?.isMember
              ? 'The player loses 30 trust points and gets a no-show on their record. A third no-show suspends their bookings for 30 days. This cannot be undone here.'
              : 'This guest has no account, so only the booking is marked.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" onClick={onClose}>
            Keep booking
          </Button>
          <Button variant="destructive" disabled={busy} onClick={confirm}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            Mark as no-show
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
