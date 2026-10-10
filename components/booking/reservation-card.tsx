'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays, Clock, Loader2, Ticket, Users } from 'lucide-react'
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
import { trackEvent } from '@/components/providers/posthog-provider'
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
  confirmed: { label: 'Confirmée', variant: 'success' },
  pending_payment: { label: 'En attente de paiement', variant: 'warning' },
  cancelled: { label: 'Annulée', variant: 'destructive' },
  completed: { label: 'Terminée', variant: 'secondary' },
  no_show: { label: 'Absence', variant: 'destructive' },
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
    trackEvent('booking.cancelled', { booking_id: r.id, actor: 'player' })
    toast.success('Réservation annulée. Le créneau est libre pour les autres joueurs.')
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
          <dt className="sr-only">Heure</dt>
          <dd className="tabular-nums">
            {formatVenueTime(r.startsAt)}–{formatVenueTime(r.endsAt)}
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <Users className="size-4 text-muted-foreground" aria-hidden />
          <dt className="sr-only">Joueurs</dt>
          <dd>{r.playerCount} joueurs</dd>
        </div>
        <div>
          <dt className="sr-only">Référence</dt>
          <dd className="font-mono text-xs text-muted-foreground">{r.reference}</dd>
        </div>
        <div>
          <Link href={`/reservations/${r.id}`} className="inline-flex items-center gap-1 text-xs underline underline-offset-4">
            <Ticket className="size-3.5" aria-hidden />
            Voir le pass
          </Link>
        </div>
      </dl>

      {r.status === 'cancelled' && r.cancellationReason && (
        <p className="mt-3 text-sm text-muted-foreground">Motif : {r.cancellationReason}</p>
      )}

      {r.upcoming && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {r.canCancel ? (
            <>
              <p className="text-xs text-muted-foreground">Annulation gratuite jusqu&apos;au {deadlineText(r.cancelDeadline)}</p>
              <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
                Annuler la réservation
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              L&apos;annulation gratuite est close 24 heures avant le début. Contactez le club pour modifier cette réservation.
            </p>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Annuler cette réservation ?</DialogTitle>
            <DialogDescription>
              {r.courtName} · {day} · {formatVenueTime(r.startsAt)}–{formatVenueTime(r.endsAt)}. Le créneau est libéré
              immédiatement et cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={`reason-${r.id}`}>Motif (facultatif)</Label>
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
              Conserver la réservation
            </Button>
            <Button variant="destructive" onClick={cancel} disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              Annuler la réservation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}
