'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { BookingDrawer, type BookingDrawerMember, type BookingDrawerSelection } from '@/components/booking/booking-drawer'
import { PlayerAuthModal } from '@/components/booking/player-auth-modal'
import { CourtSlotMatrix, type MatrixCourt, type MatrixSelection } from '@/components/courts/court-slot-matrix'
import { DayPicker } from '@/components/courts/day-picker'
import { cn } from '@/lib/utils'

/**
 * A club's booking experience: pick a day, pick a slot on a court, book it in the
 * drawer. Availability is loaded on the server for the day in the URL
 * (`?date=`); changing the day navigates, and after any booking the server data
 * is refreshed so the slot immediately shows as taken.
 */
export function ClubBookingView({
  orgId,
  orgName,
  dateStr,
  minDate,
  maxDate,
  courts,
  member,
  closedNotice = null,
}: {
  orgId: string
  orgName: string
  dateStr: string
  minDate: string
  maxDate: string
  courts: MatrixCourt[]
  member: BookingDrawerMember | null
  /** Shown above the matrix when the club is closed on the chosen day. */
  closedNotice?: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = React.useTransition()

  const [selection, setSelection] = React.useState<BookingDrawerSelection | null>(null)
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [authOpen, setAuthOpen] = React.useState(false)
  // Remounting the matrix is how its highlighted slot is cleared.
  const [matrixKey, setMatrixKey] = React.useState(0)

  const changeDate = (next: string) => {
    setDrawerOpen(false)
    startTransition(() => router.push(`${pathname}?date=${next}`, { scroll: false }))
  }

  const handleSlotSelect = (picked: MatrixSelection | null) => {
    if (!picked) {
      setDrawerOpen(false)
      return
    }
    const court = courts.find((c) => c.id === picked.courtId)
    if (!court) return

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
    setDrawerOpen(true)
  }

  const handleDrawerOpenChange = (open: boolean) => {
    setDrawerOpen(open)
    // Closing the drawer un-highlights the slot. (The selection itself is kept so
    // the drawer's content does not vanish mid slide-out.)
    if (!open) setMatrixKey((k) => k + 1)
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
      <DayPicker
        dateStr={dateStr}
        minDate={minDate}
        maxDate={maxDate}
        onChange={changeDate}
        pending={pending}
      />

      {closedNotice && (
        <p role="status" className="rounded-lg bg-card px-4 py-3 text-sm text-muted-foreground">
          {closedNotice}
        </p>
      )}

      <div className={cn('transition-opacity', pending && 'opacity-60')} aria-busy={pending}>
        <CourtSlotMatrix
          key={`${dateStr}-${matrixKey}`}
          courtData={courts}
          selectedDate={dateStr}
          onSlotSelect={handleSlotSelect}
        />
      </div>

      <BookingDrawer
        open={drawerOpen}
        onOpenChange={handleDrawerOpenChange}
        orgId={orgId}
        orgName={orgName}
        selection={selection}
        member={member}
        onRequestSignIn={requestSignIn}
        onBooked={() => router.refresh()}
        onSlotUnavailable={() => router.refresh()}
      />

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
