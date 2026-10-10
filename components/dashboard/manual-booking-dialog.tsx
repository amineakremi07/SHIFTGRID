'use client'

import * as React from 'react'
import { CheckCircle2, Loader2, PhoneCall } from 'lucide-react'
import { toast } from 'sonner'

import type { BoardBooking, BoardCourt } from '@/components/dashboard/bookings-board'
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
import { Textarea } from '@/components/ui/textarea'
import { formatVenueTime, minutesSinceVenueDayStart, timeToMinutes } from '@/lib/court-time'
import { computePrice } from '@/lib/pricing'
import { PLAYER_COUNT_OPTIONS, SPORT_DURATION_MIN } from '@/lib/slot-duration'
import { manualBookingSchema } from '@/lib/validations/booking'

type Created = {
  booking_id: string
  reference: string
  court: string
  starts_at: string
  ends_at: string
  status: 'confirmed' | 'pending_payment'
  payment_status: 'paid' | 'pending'
  amount: number
  check_in_code: string | null
  email_queued: boolean
}

type Errors = Partial<Record<'court' | 'start' | 'name' | 'phone' | 'email' | 'notes' | 'form', string>>

const tnd = (n: number) => `${n.toFixed(2)} TND`

/** Server field names -> this form's. */
const FIELD: Record<string, keyof Errors> = {
  court_id: 'court',
  starts_at: 'start',
  start_time: 'start',
  date: 'start',
  full_name: 'name',
  phone: 'phone',
  email: 'email',
  notes: 'notes',
}

export type ManualBookingPreset = { courtId?: string; startsAt?: string } | null

/**
 * "Add Manual Booking": a booking for someone at the desk or on the phone. Courts and
 * free times come from the schedule already on screen; the date box moves the whole
 * schedule to that day, so the free slots shown are always that day's real ones.
 * Everything is re-checked on the server (POST /api/v1/bookings/manual), which is
 * also what answers "Slot already booked" if someone took the slot a moment ago.
 */
export function ManualBookingDialog({
  open,
  onOpenChange,
  preset,
  courts,
  bookings,
  dateStr,
  today,
  maxDate,
  onDateChange,
  datePending,
  onBooked,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  preset: ManualBookingPreset
  courts: BoardCourt[]
  bookings: BoardBooking[]
  dateStr: string
  today: string
  maxDate: string
  onDateChange: (date: string) => void
  datePending: boolean
  onBooked: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto bg-[#eae6df] sm:max-w-lg">
        {/* Mounted only while open, so every opening starts with a clean form. */}
        <ManualBookingForm
          preset={preset}
          courts={courts}
          bookings={bookings}
          dateStr={dateStr}
          today={today}
          maxDate={maxDate}
          onDateChange={onDateChange}
          datePending={datePending}
          onBooked={onBooked}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function ManualBookingForm({
  preset,
  courts,
  bookings,
  dateStr,
  today,
  maxDate,
  onDateChange,
  datePending,
  onBooked,
  onClose,
}: {
  preset: ManualBookingPreset
  courts: BoardCourt[]
  bookings: BoardBooking[]
  dateStr: string
  today: string
  maxDate: string
  onDateChange: (date: string) => void
  datePending: boolean
  onBooked: () => void
  onClose: () => void
}) {
  const activeCourts = courts.filter((c) => c.status === 'active')
  const [courtId, setCourtId] = React.useState(() => preset?.courtId ?? (activeCourts.length === 1 ? activeCourts[0].id : ''))
  const [start, setStart] = React.useState(preset?.startsAt ?? '')
  const [players, setPlayers] = React.useState('')
  const [name, setName] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [payment, setPayment] = React.useState<'paid_on_site' | 'pay_at_venue'>('pay_at_venue')
  const [notes, setNotes] = React.useState('')
  const [errors, setErrors] = React.useState<Errors>({})
  const [saving, setSaving] = React.useState(false)
  const [created, setCreated] = React.useState<Created | null>(null)

  const court = activeCourts.find((c) => c.id === courtId)
  const taken = new Set(
    bookings.filter((b) => b.courtId === courtId && b.status !== 'cancelled').map((b) => Date.parse(b.startsAt))
  )
  // Free = not past and no live booking on that start (cancelled ones free their slot).
  const freeSlots = court && !court.closed ? court.slots.filter((s) => !s.past && !taken.has(Date.parse(s.start))) : []
  const slot = freeSlots.find((s) => s.start === start)
  const counts = court ? PLAYER_COUNT_OPTIONS[court.sport] : []
  const playerCount = players && counts.some((n) => String(n) === players) ? players : counts[0] ? String(counts[0]) : ''

  const price =
    court && slot
      ? computePrice({
          pricePerHour: court.pricePerHour,
          nightSurchargePerHour: court.nightSurchargePerHour,
          nightStartsAtMinutes: timeToMinutes(court.nightStartsAt),
          startMinutes: minutesSinceVenueDayStart(slot.start, dateStr),
          durationMinutes: SPORT_DURATION_MIN[court.sport],
        })
      : null

  const reset = () => {
    setStart('')
    setName('')
    setPhone('')
    setEmail('')
    setNotes('')
    setPayment('pay_at_venue')
    setErrors({})
    setCreated(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const found: Errors = {}
    if (!court) found.court = 'Choisissez un terrain.'
    if (!slot) found.start = 'Choisissez un horaire libre.'

    const payload = {
      court_id: courtId,
      date: dateStr,
      starts_at: slot?.start,
      player_count: playerCount ? Number(playerCount) : undefined,
      full_name: name,
      phone,
      email,
      payment_status: payment,
      notes,
    }
    // The same schema the server runs, so the messages match.
    const checked = manualBookingSchema.safeParse(payload)
    if (!checked.success) {
      for (const [key, messages] of Object.entries(checked.error.flatten().fieldErrors)) {
        const field = FIELD[key]
        if (field && messages?.[0] && !found[field]) found[field] = messages[0]
      }
    }
    if (Object.keys(found).length > 0) {
      setErrors(found)
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const res = await fetch('/api/v1/bookings/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = (await res.json().catch(() => null)) as
        | { success: true; data: Created }
        | { success: false; error?: string; code?: string; fieldErrors?: Record<string, string[] | undefined> }
        | null

      if (json?.success) {
        setCreated(json.data)
        toast.success(`Réservé. Référence ${json.data.reference}`)
        onBooked() // the schedule refreshes and the slot shows as taken
        return
      }

      const message = json && !json.success && json.error ? json.error : 'Impossible de créer la réservation. Veuillez réessayer.'
      if (res.status === 409) {
        // Someone took it a moment ago: show the real state and let staff pick another time.
        setStart('')
        setErrors({ start: `${message}. Choisissez un autre horaire.` })
        toast.error(message)
        onBooked()
        return
      }
      const server: Errors = {}
      if (json && !json.success && json.fieldErrors) {
        for (const [key, messages] of Object.entries(json.fieldErrors)) {
          const field = FIELD[key]
          if (field && messages?.[0]) server[field] = messages[0]
        }
      }
      setErrors(Object.keys(server).length > 0 ? server : { form: message })
      toast.error(message)
    } catch {
      const message = 'Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.'
      setErrors({ form: message })
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  if (created) {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-[#0e634f]" aria-hidden /> Réservation créée
          </DialogTitle>
          <DialogDescription>
            {created.court} · {formatVenueTime(created.starts_at)}–{formatVenueTime(created.ends_at)} ·{' '}
            {created.payment_status === 'paid' ? `payé sur place (${tnd(created.amount)})` : `${tnd(created.amount)} à payer sur place`}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg bg-[#f7f5f2] p-4 text-center" data-testid="manual-created">
          <p className="text-xs uppercase tracking-wide text-[#645757]">Code d&apos;arrivée</p>
          <p className="font-mono text-4xl font-bold tracking-[0.3em]" data-testid="manual-check-in-code">
            {created.check_in_code}
          </p>
          <p className="mt-2 text-sm text-[#645757]">
            Référence <span className="font-mono">{created.reference}</span>. Le client présente ce code à l&apos;accueil.
            {created.email_queued ? ' Il est aussi en route vers son e-mail.' : ' Lisez-le-lui : aucun e-mail n\'a été indiqué.'}
          </p>
        </div>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={reset}>
            Ajouter une autre
          </Button>
          <Button type="button" onClick={onClose} className="bg-[#1d3023] text-[#f7f5f2] hover:bg-[#1d3023]/90">
            Terminé
          </Button>
        </DialogFooter>
      </>
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Ajouter une réservation manuelle</DialogTitle>
        <DialogDescription>Pour un client au guichet ou au téléphone. Le créneau est bloqué immédiatement pour tout le monde.</DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} className="grid gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="mb-court">Terrain</Label>
            <Select
              value={courtId}
              onValueChange={(v) => {
                setCourtId(v)
                setStart('')
                setPlayers('')
              }}
            >
              <SelectTrigger id="mb-court" className="w-full" aria-invalid={Boolean(errors.court)}>
                <SelectValue placeholder={activeCourts.length ? 'Choisissez un terrain' : 'Aucun terrain actif'} />
              </SelectTrigger>
              <SelectContent>
                {activeCourts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} · {c.sport}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.court && <p role="alert" className="text-xs text-destructive">{errors.court}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="mb-date">Date</Label>
            <Input
              id="mb-date"
              type="date"
              min={today}
              max={maxDate}
              value={dateStr}
              disabled={datePending}
              onChange={(e) => {
                if (e.target.value && e.target.value >= today && e.target.value <= maxDate) {
                  setStart('')
                  onDateChange(e.target.value)
                }
              }}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="mb-start">Heure de début</Label>
            <Select value={slot ? slot.start : ''} onValueChange={setStart} disabled={!court || freeSlots.length === 0}>
              <SelectTrigger id="mb-start" className="w-full" aria-invalid={Boolean(errors.start)}>
                <SelectValue placeholder={!court ? 'Choisissez d\'abord un terrain' : freeSlots.length === 0 ? 'Aucun horaire libre' : 'Choisissez un horaire'} />
              </SelectTrigger>
              <SelectContent>
                {freeSlots.map((s) => (
                  <SelectItem key={s.start} value={s.start}>
                    {formatVenueTime(s.start)} – {formatVenueTime(s.end)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.start && <p role="alert" className="text-xs text-destructive">{errors.start}</p>}
            {court && (
              <p className="text-xs text-[#645757]">
                {court.closed ? 'Le club est fermé ce jour-là.' : `Chaque séance de ${court.sport} dure ${SPORT_DURATION_MIN[court.sport]} min (l\'heure de fin est automatique).`}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="mb-players">Joueurs</Label>
            <Select value={playerCount} onValueChange={setPlayers} disabled={!court}>
              <SelectTrigger id="mb-players" className="w-full">
                <SelectValue placeholder="—" />
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
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="mb-name">Nom du client</Label>
          <Input id="mb-name" value={name} onChange={(e) => setName(e.target.value)} error={Boolean(errors.name)} maxLength={100} autoComplete="off" />
          {errors.name && <p role="alert" className="text-xs text-destructive">{errors.name}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="mb-phone">Téléphone (facultatif)</Label>
            <Input
              id="mb-phone"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98 123 456"
              error={Boolean(errors.phone)}
              autoComplete="off"
            />
            {errors.phone && <p role="alert" className="text-xs text-destructive">{errors.phone}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mb-email">E-mail (facultatif)</Label>
            <Input
              id="mb-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="envoie le code d'arrivée"
              error={Boolean(errors.email)}
              autoComplete="off"
            />
            {errors.email && <p role="alert" className="text-xs text-destructive">{errors.email}</p>}
          </div>
        </div>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Paiement</legend>
          {(
            [
              ['pay_at_venue', 'Payer sur place', 'Reste en attente jusqu\'à ce que vous appuyiez sur Marquer payé.'],
              ['paid_on_site', 'Payé sur place', 'Espèces déjà encaissées : la réservation est confirmée et payée.'],
            ] as const
          ).map(([value, label, hint]) => (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-[#f7f5f2] px-3 py-2.5 text-sm has-[:checked]:ring-2 has-[:checked]:ring-[#1d3023]"
            >
              <input
                type="radio"
                name="manual-payment"
                value={value}
                checked={payment === value}
                onChange={() => setPayment(value)}
                className="mt-1 accent-[#1d3023]"
              />
              <span>
                <span className="font-medium">{label}</span>
                <span className="block text-xs text-[#645757]">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="grid gap-1.5">
          <Label htmlFor="mb-notes">Notes (facultatif, équipe uniquement)</Label>
          <Textarea
            id="mb-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="ex. : réservation téléphonique, réservation au guichet"
          />
          {errors.notes && <p role="alert" className="text-xs text-destructive">{errors.notes}</p>}
        </div>

        {price && (
          <p className="rounded-lg bg-[#f7f5f2] px-3 py-2.5 text-sm">
            <span className="font-semibold">{tnd(price.total)}</span>
            <span className="text-[#645757]">
              {' '}
              {payment === 'paid_on_site' ? 'encaissés sur place' : 'à payer sur place'}
              {price.surcharge > 0 && ` (dont ${tnd(price.surcharge)} d\'éclairage de nuit)`}
            </span>
          </p>
        )}

        {errors.form && <p role="alert" className="text-sm text-destructive">{errors.form}</p>}

        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={saving || datePending} className="bg-[#1d3023] text-[#f7f5f2] hover:bg-[#1d3023]/90">
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : <PhoneCall aria-hidden />}
            Confirmer la réservation
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
