'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Loader2, Phone, Plus, User, UserRound, X } from 'lucide-react'
import { toast } from 'sonner'

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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cancelBooking, createWalkInBooking } from '@/lib/actions/org-bookings'
import { formatVenueTime, minutesSinceVenueDayStart, timeToMinutes } from '@/lib/court-time'
import { computePrice } from '@/lib/pricing'
import { PLAYER_COUNT_OPTIONS, SPORT_DURATION_MIN, type Sport } from '@/lib/slot-duration'
import { guestDetailsSchema } from '@/lib/validations/booking'
import type { BookingStatus } from '@/lib/types/database'
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
  reference: string
}

const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: 'Confirmed',
  pending_payment: 'Pending',
  cancelled: 'Cancelled',
  completed: 'Completed',
}
const STATUS_VARIANT: Record<BookingStatus, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  confirmed: 'success',
  pending_payment: 'warning',
  cancelled: 'destructive',
  completed: 'secondary',
}

const tnd = (n: number) => `${n.toFixed(2)} TND`
const isOpen = (b: BoardBooking) => b.status === 'pending_payment' || b.status === 'confirmed'

type WalkInTarget = { court: BoardCourt; slot: BoardSlot }

export function BookingsBoard({
  dateStr,
  today,
  minDate,
  maxDate,
  courts,
  bookings,
}: {
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
  const [walkIn, setWalkIn] = React.useState<WalkInTarget | null>(null)
  const [toCancel, setToCancel] = React.useState<BoardBooking | null>(null)

  // Keep the day fresh while the tab is open (online bookings land here too).
  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, 30_000)
    return () => window.clearInterval(id)
  }, [router])

  const changeDate = (next: string) =>
    startTransition(() => router.push(`${pathname}?date=${next}`, { scroll: false }))

  const open = bookings.filter(isOpen)
  const cancelled = bookings.filter((b) => b.status === 'cancelled')
  const revenue = open.reduce((sum, b) => sum + (b.amount ?? 0), 0)
  const courtName = (id: string | null) => courts.find((c) => c.id === id)?.name ?? 'Removed court'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Daily schedule</h2>
          <p className="text-sm text-[#645757]">Tap a free slot to record a walk-in or phone booking.</p>
        </div>
        <DayPicker dateStr={dateStr} minDate={minDate} maxDate={maxDate} onChange={changeDate} pending={pending} />
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
                bookings={open.filter((b) => b.courtId === court.id)}
                onWalkIn={(slot) => setWalkIn({ court, slot })}
                onCancel={setToCancel}
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

      <WalkInDialog
        key={walkIn ? walkIn.slot.start + walkIn.court.id : 'closed'}
        target={walkIn}
        dateStr={dateStr}
        onClose={() => setWalkIn(null)}
        onDone={() => {
          setWalkIn(null)
          router.refresh()
        }}
      />

      <CancelDialog
        booking={toCancel}
        onClose={() => setToCancel(null)}
        onDone={() => {
          setToCancel(null)
          router.refresh()
        }}
      />

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
  onWalkIn,
  onCancel,
}: {
  court: BoardCourt
  bookings: BoardBooking[]
  onWalkIn: (slot: BoardSlot) => void
  onCancel: (b: BoardBooking) => void
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
            <BookingRow key={b.id} booking={b} onCancel={onCancel} />
          ))}
          {court.slots.map((slot) => {
            const booking = byStart.get(Date.parse(slot.start))
            if (booking) return <BookingRow key={slot.start} booking={booking} onCancel={onCancel} />
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

function BookingRow({ booking, onCancel }: { booking: BoardBooking; onCancel: (b: BoardBooking) => void }) {
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
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-[#645757]">
        <span className="inline-flex items-center gap-1.5">
          {booking.bookerPhone && (
            <>
              <Phone className="size-3" aria-hidden />
              {booking.bookerPhone}
            </>
          )}
          <span className="font-mono">{booking.reference}</span>
          {booking.amount !== null && <span>· {tnd(booking.amount)}</span>}
        </span>
        <Button variant="destructive" size="xs" onClick={() => onCancel(booking)}>
          <X aria-hidden /> Cancel
        </Button>
      </div>
    </li>
  )
}

function WalkInDialog({
  target,
  dateStr,
  onClose,
  onDone,
}: {
  target: WalkInTarget | null
  dateStr: string
  onClose: () => void
  onDone: () => void
}) {
  const sport = target?.court.sport ?? 'padel'
  const counts = PLAYER_COUNT_OPTIONS[sport]
  const [name, setName] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [players, setPlayers] = React.useState<string>(String(counts[0]))
  const [errors, setErrors] = React.useState<Record<string, string[] | undefined>>({})
  const [saving, setSaving] = React.useState(false)

  const price = target
    ? computePrice({
        pricePerHour: target.court.pricePerHour,
        nightSurchargePerHour: target.court.nightSurchargePerHour,
        nightStartsAtMinutes: timeToMinutes(target.court.nightStartsAt),
        startMinutes: minutesSinceVenueDayStart(target.slot.start, dateStr),
        durationMinutes: SPORT_DURATION_MIN[target.court.sport],
      })
    : null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!target) return
    const guest = guestDetailsSchema.safeParse({ fullName: name, phone })
    if (!guest.success) {
      setErrors(guest.error.flatten().fieldErrors)
      return
    }
    setErrors({})
    setSaving(true)
    const result = await createWalkInBooking({
      courtId: target.court.id,
      date: dateStr,
      startsAt: target.slot.start,
      playerCount: Number(players),
      guest: { fullName: name, phone },
    })
    setSaving(false)
    if (!result.ok) {
      if (result.fieldErrors) setErrors(result.fieldErrors)
      toast.error(result.message)
      // The slot may have just been taken; show the real state.
      if (result.message.includes('taken')) onDone()
      return
    }
    toast.success(`Booked. Reference ${result.reference}`)
    onDone()
  }

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#eae6df] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Walk-in booking</DialogTitle>
          <DialogDescription>
            {target &&
              `${target.court.name} · ${formatVenueTime(target.slot.start)}–${formatVenueTime(target.slot.end)}`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="wi-name">Customer name</Label>
            <Input
              id="wi-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={Boolean(errors.fullName)}
              maxLength={100}
              autoComplete="off"
            />
            {errors.fullName?.[0] && <p role="alert" className="text-xs text-destructive">{errors.fullName[0]}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="wi-phone">Mobile number</Label>
            <Input
              id="wi-phone"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98 123 456"
              error={Boolean(errors.phone)}
              autoComplete="off"
            />
            {errors.phone?.[0] && <p role="alert" className="text-xs text-destructive">{errors.phone[0]}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="wi-players">Players</Label>
            <Select value={players} onValueChange={setPlayers}>
              <SelectTrigger id="wi-players" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {counts.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} players
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {price && (
            <p className="rounded-lg bg-[#f7f5f2] px-3 py-2.5 text-sm">
              <span className="font-semibold">{tnd(price.total)}</span>
              <span className="text-[#645757]">
                {' '}
                cash at the club
                {price.surcharge > 0 && ` (incl. ${tnd(price.surcharge)} night lighting)`}
              </span>
            </p>
          )}

          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-[#1d3023] text-[#f7f5f2] hover:bg-[#1d3023]/90">
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              Confirm booking
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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

  const confirm = async () => {
    if (!booking) return
    setBusy(true)
    const result = await cancelBooking(booking.id)
    setBusy(false)
    if (!result.ok) {
      toast.error(result.message)
      onDone() // the booking may already be gone; show the real state
      return
    }
    toast.success('Booking cancelled. The slot is free again.')
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
