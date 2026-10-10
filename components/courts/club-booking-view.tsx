'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { BookingDrawer, useIsDesktop, type BookingDrawerMember, type BookingDrawerSelection } from '@/components/booking/booking-drawer'
import { PlayerAuthModal } from '@/components/booking/player-auth-modal'
import { SlotPicker } from '@/components/booking/slot-picker'
import type { MatrixCourt, MatrixSelection } from '@/components/courts/court-slot-matrix'
import { trackEvent } from '@/components/providers/posthog-provider'
import { Button } from '@/components/ui/button'
import { formatVenueDate, minutesSinceVenueDayStart, timeSlotLabel, timeToMinutes } from '@/lib/court-time'
import { computePrice } from '@/lib/pricing'
import { formatTND } from '@/lib/payments'
import { SPORT_DURATION_MIN } from '@/lib/slot-duration'
import type { OnlineMode } from '@/lib/payments'
import { toast } from 'sonner'

/**
 * A club's booking experience: pick a day, pick a slot on a court, book it in the
 * drawer. Availability is loaded on the server for the day in the URL
 * (`?date=`); changing the day navigates, and after any booking the server data
 * is refreshed so the slot immediately shows as taken.
 */
export function ClubBookingView({
  orgId,
  orgName,
  orgAddress = null,
  orgWhatsapp = null,
  dateStr,
  minDate,
  maxDate,
  courts,
  member,
  closedNotice = null,
  onlineMode = 'disabled',
}: {
  orgId: string
  orgName: string
  /** Venue address for the calendar event. */
  orgAddress?: string | null
  /** The club's WhatsApp number (digits), if it set one. */
  orgWhatsapp?: string | null
  dateStr: string
  minDate: string
  maxDate: string
  courts: MatrixCourt[]
  member: BookingDrawerMember | null
  /** Shown above the matrix when the club is closed on the chosen day. */
  closedNotice?: string | null
  /** Online / split payment availability, decided on the server. */
  onlineMode?: OnlineMode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = React.useTransition()

  const isDesktop = useIsDesktop()
  const [selection, setSelection] = React.useState<BookingDrawerSelection | null>(null)
  // Phones: picking a slot shows the sticky "Book now" bar; the drawer opens from it.
  const [barOpen, setBarOpen] = React.useState(false)
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [authOpen, setAuthOpen] = React.useState(false)
  // Remounting the matrix is how its highlighted slot is cleared.
  const [matrixKey, setMatrixKey] = React.useState(0)
  // The player just booked this slot themselves: it will read as taken after the
  // refresh, and that must not be mistaken for someone else getting there first.
  const [justBooked, setJustBooked] = React.useState(false)

  // A live update can take the slot the player is looking at. Close the drawer
  // rather than let them fill in a form for a slot that is gone. (State is adjusted
  // during render, the React-recommended way to derive it from props.)
  const selectedSlotTaken = React.useMemo(() => {
    if (!selection || justBooked) return false
    const slot = courts.find((c) => c.id === selection.courtId)?.slots.find((s) => s.start === selection.startsAt)
    return Boolean(slot && slot.state !== 'available')
  }, [courts, selection, justBooked])
  if (drawerOpen && selectedSlotTaken) {
    setDrawerOpen(false)
    setMatrixKey((k) => k + 1)
  }
  React.useEffect(() => {
    if (selectedSlotTaken) toast.error('Ce créneau vient d\'être pris. Veuillez choisir un autre horaire.')
  }, [selectedSlotTaken])

  const changeDate = (next: string) => {
    setDrawerOpen(false)
    setBarOpen(false)
    startTransition(() => router.push(`${pathname}?date=${next}`, { scroll: false }))
  }

  const handleSlotSelect = (picked: MatrixSelection | null) => {
    if (!picked) {
      setDrawerOpen(false)
      setBarOpen(false)
      return
    }
    const court = courts.find((c) => c.id === picked.courtId)
    if (!court) return

    trackEvent('time_slot.selected', {
      time_slot: timeSlotLabel(picked.slot.start, picked.slot.end),
      date: dateStr,
      club_id: orgId,
      court_id: court.id,
      sport: court.sport,
    })
    setJustBooked(false)
    setSelection({
      courtId: court.id,
      courtName: court.name,
      sport: court.sport,
      date: dateStr,
      startsAt: picked.slot.start,
      endsAt: picked.slot.end,
      pricePerHour: court.pricePerHour,
      nightSurchargePerHour: court.nightSurchargePerHour ?? 0,
      nightStartsAt: court.nightStartsAt ?? '18:00:00',
    })
    if (isDesktop) setDrawerOpen(true)
    else setBarOpen(true)
  }

  const handleDrawerOpenChange = (open: boolean) => {
    setDrawerOpen(open)
    if (!open) setBarOpen(false)
    // Closing the drawer un-highlights the slot. (The selection itself is kept so
    // the drawer's content does not vanish mid slide-out.)
    if (!open) {
      setMatrixKey((k) => k + 1)
      setJustBooked(false)
    }
  }

  // Two modal layers at once are fragile, so hand over: drawer closes, sign-in
  // opens, and the drawer comes back with the same slot when sign-in finishes.
  const requestSignIn = () => {
    setDrawerOpen(false)
    setAuthOpen(true)
  }
  const handleAuthOpenChange = (open: boolean) => {
    setAuthOpen(open)
    if (!open && selection) setDrawerOpen(true)
  }

  return (
    <div className="space-y-6">
      <SlotPicker
        orgId={orgId}
        dateStr={dateStr}
        minDate={minDate}
        maxDate={maxDate}
        courts={courts}
        onDateChange={changeDate}
        onSelect={handleSlotSelect}
        onRealtimeChange={() => router.refresh()}
        pending={pending}
        closedNotice={closedNotice}
        matrixKey={matrixKey}
      />

      <BookingDrawer
        open={drawerOpen}
        onOpenChange={handleDrawerOpenChange}
        orgId={orgId}
        orgName={orgName}
        orgAddress={orgAddress}
        orgWhatsapp={orgWhatsapp}
        selection={selection}
        member={member}
        onlineMode={onlineMode}
        onRequestSignIn={requestSignIn}
        onBooked={() => {
          setJustBooked(true)
          router.refresh()
        }}
        onSlotUnavailable={() => router.refresh()}
      />

      {barOpen && selection && !drawerOpen && !authOpen && (
        <StickyBookingBar
          selection={selection}
          onBook={() => {
            setBarOpen(false)
            setDrawerOpen(true)
          }}
          onClear={() => {
            setBarOpen(false)
            setMatrixKey((k) => k + 1)
          }}
        />
      )}

      <PlayerAuthModal
        orgId={orgId}
        open={authOpen}
        onOpenChange={handleAuthOpenChange}
        defaultMode="signin"
        onSuccess={() => {
          // Pull the new session's profile into the drawer.
          router.refresh()
          setAuthOpen(false)
          if (selection) setDrawerOpen(true)
        }}
      />
    </div>
  )
}

/** Phones only: a thumb-reach action bar pinned to the bottom once a slot is picked. */
function StickyBookingBar({
  selection,
  onBook,
  onClear,
}: {
  selection: BookingDrawerSelection
  onBook: () => void
  onClear: () => void
}) {
  const price = computePrice({
    pricePerHour: selection.pricePerHour,
    nightSurchargePerHour: selection.nightSurchargePerHour,
    nightStartsAtMinutes: timeToMinutes(selection.nightStartsAt),
    startMinutes: minutesSinceVenueDayStart(selection.startsAt, selection.date),
    durationMinutes: SPORT_DURATION_MIN[selection.sport],
  })
  return (
    <div
      role="region"
      aria-label="Votre sélection"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pt-3 shadow-none backdrop-blur md:hidden"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <div className="min-w-0 flex-1 text-sm">
          <p className="truncate font-semibold">{selection.courtName}</p>
          <p className="truncate tabular-nums text-muted-foreground">
            {formatVenueDate(selection.date)} · {timeSlotLabel(selection.startsAt, selection.endsAt)} · {formatTND(price.total)}
          </p>
        </div>
        <Button type="button" variant="ghost" className="h-12 min-w-12" aria-label="Effacer la sélection" onClick={onClear}>
          ✕
        </Button>
        <Button type="button" className="h-12 px-5 text-base" onClick={onBook}>
          Réserver
        </Button>
      </div>
    </div>
  )
}
