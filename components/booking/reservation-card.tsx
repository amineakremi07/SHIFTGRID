'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Clock, Loader2, Users } from 'lucide-react'
import { toast } from 'sonner'

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
import { cancelBookingAction } from '@/lib/actions/bookings'
import { formatVenueDate, formatVenueTime, venueDateString } from '@/lib/court-time'
import type { BookingStatus, Sport } from '@/lib/types/database'

export type Reservation = {
  id: string
  clubName: string
  courtName: string
  sport: Sport
  startsAt: string
  endsAt: string
  playerCount: number
  status: BookingStatus
  reference: string
  /** Open and not finished yet. */
  upcoming: boolean
  /** Decided on the server: upcoming and before the free-cancellation deadline. */
  canCancel: boolean
  cancelDeadline: string
  cancellationReason: string | null
}

const STATUS: Record<BookingStatus, { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }> = {
  confirmed: { label: 'Confirmed', variant: 'success' },
  pending_payment: { label: 'Pay at the club', variant: 'warning' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
  completed: { label: 'Completed', variant: 'secondary' },
}

function deadlineText(iso: string) {
  const at = new Date(iso)
  return `${formatVenueDate(venueDateString(at))}, ${formatVenueTime(at)}`
}

export function ReservationCard({ reservation: r }: { reservation: Reservation }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const status = STATUS[r.status]
  const day = formatVenueDate(venueDateString(new Date(r.startsAt)))

  const cancel = async () => {
    setBusy(true)
    const result = await cancelBookingAction({ bookingId: r.id, reason })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.message)
      setOpen(false)
      router.refresh() // the booking may have changed since this page loaded
      return
    }
    toast.success('Booking cancelled. The slot is free for other players.')
    setOpen(false)
    router.refresh()
  }

  return (
    <li className="rounded-xl bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{r.courtName}</h3>
          <p className="text-sm capitalize text-muted-foreground">
            {r.clubName} · {r.sport}
          </p>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
          <dt className="sr-only">Date</dt>
          <dd>{day}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="size-4 text-muted-foreground" aria-hidden />
          <dt className="sr-only">Time</dt>
          <dd className="tabular-nums">
            {formatVenueTime(r.startsAt)}–{formatVenueTime(r.endsAt)}
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <Users className="size-4 text-muted-foreground" aria-hidden />
          <dt className="sr-only">Players</dt>
          <dd>{r.playerCount} players</dd>
        </div>
        <div>
          <dt className="sr-only">Reference</dt>
          <dd className="font-mono text-xs text-muted-foreground">{r.reference}</dd>
        </div>
      </dl>

      {r.status === 'cancelled' && r.cancellationReason && (
        <p className="mt-3 text-sm text-muted-foreground">Reason: {r.cancellationReason}</p>
      )}

      {r.upcoming && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {r.canCancel ? (
            <>
              <p className="text-xs text-muted-foreground">Free cancellation until {deadlineText(r.cancelDeadline)}</p>
              <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
                Cancel booking
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Free cancellation closed 24 hours before the start. Contact the club to change this booking.
            </p>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel this booking?</DialogTitle>
            <DialogDescription>
              {r.courtName} · {day} · {formatVenueTime(r.startsAt)}–{formatVenueTime(r.endsAt)}. The slot is released
              straight away and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={`reason-${r.id}`}>Reason (optional)</Label>
            <Textarea
              id={`reason-${r.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={300}
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Keep booking
            </Button>
            <Button variant="destructive" onClick={cancel} disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              Cancel booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}
