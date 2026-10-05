'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, Loader2, Pencil, Plus } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { archiveCourtAction, restoreCourtAction, saveCourt, setCourtStatus } from '@/lib/actions/org-courts'
import { BUFFER_MIN, SPORT_DURATION_MIN, type Sport } from '@/lib/slot-duration'
import { courtFormSchema, type CourtFormInput } from '@/lib/validations/court'

export type ManagedCourt = {
  id: string
  name: string
  sport: Sport
  status: 'active' | 'maintenance'
  pricePerHour: number
  nightSurchargePerHour: number
  /** "18:00" */
  nightStartsAt: string
}

export type ArchivedCourt = { id: string; name: string; sport: Sport; archivedAt: string }

const SPORT_LABEL: Record<Sport, string> = { padel: 'Padel', tennis: 'Tennis', football: 'Football' }

const EMPTY_FORM: CourtFormInput = {
  name: '',
  sport: 'padel',
  pricePerHour: '',
  nightSurchargePerHour: '0',
  nightStartsAt: '18:00',
  status: 'active',
}

const tnd = (n: number) => `${n.toFixed(2)} TND`

export function CourtManager({ courts, archived = [] }: { courts: ManagedCourt[]; archived?: ArchivedCourt[] }) {
  const router = useRouter()
  const [editing, setEditing] = React.useState<ManagedCourt | 'new' | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [toArchive, setToArchive] = React.useState<ManagedCourt | null>(null)

  const archive = async () => {
    if (!toArchive) return
    setBusyId(toArchive.id)
    const result = await archiveCourtAction(toArchive.id)
    setBusyId(null)
    if (!result.ok) {
      toast.error(result.message)
      setToArchive(null) // the message says why (e.g. upcoming bookings); nothing more to confirm
      return
    }
    toast.success(`${toArchive.name} archived. Its booking history is kept.`)
    setToArchive(null)
    router.refresh()
  }

  const restore = async (court: ArchivedCourt) => {
    setBusyId(court.id)
    const result = await restoreCourtAction(court.id)
    setBusyId(null)
    if (!result.ok) return void toast.error(result.message)
    toast.success(`${court.name} is back`)
    router.refresh()
  }

  const toggleStatus = async (court: ManagedCourt, active: boolean) => {
    setBusyId(court.id)
    const result = await setCourtStatus(court.id, active ? 'active' : 'maintenance')
    setBusyId(null)
    if (!result.ok) return void toast.error(result.message)
    toast.success(active ? `${court.name} is bookable again` : `${court.name} is in maintenance`)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Courts</h2>
          <p className="text-sm text-[#645757]">
            Prices are per hour in TND. Slot length follows the sport and cannot be changed.
          </p>
        </div>
        <Button
          onClick={() => setEditing('new')}
          className="h-9 bg-[#1d3023] px-3 text-[#f7f5f2] hover:bg-[#1d3023]/90"
        >
          <Plus aria-hidden /> Add court
        </Button>
      </div>

      {courts.length === 0 ? (
        <div className="rounded-xl bg-[#eae6df] px-6 py-12 text-center">
          <p className="text-lg font-semibold">No courts yet</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-sm text-[#645757]">
            Add your first court so players can start booking.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5">
          {courts.map((court) => {
            const active = court.status === 'active'
            return (
              <li key={court.id} className="rounded-xl bg-[#eae6df] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold">{court.name}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{SPORT_LABEL[court.sport]}</Badge>
                      <Badge variant={active ? 'success' : 'warning'}>{active ? 'Active' : 'Maintenance'}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {busyId === court.id && <Loader2 className="size-4 animate-spin" aria-hidden />}
                    <Switch
                      checked={active}
                      disabled={busyId === court.id}
                      onCheckedChange={(v) => toggleStatus(court, v)}
                      aria-label={`${court.name} is bookable`}
                    />
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-[#645757]">Base rate</dt>
                    <dd className="font-medium">{tnd(court.pricePerHour)}/h</dd>
                  </div>
                  <div>
                    <dt className="text-[#645757]">Night light</dt>
                    <dd className="font-medium">
                      {court.nightSurchargePerHour > 0
                        ? `+${tnd(court.nightSurchargePerHour)}/h from ${court.nightStartsAt}`
                        : 'None'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#645757]">Slot</dt>
                    <dd className="font-medium">
                      {SPORT_DURATION_MIN[court.sport]} min
                      <span className="text-[#645757]"> + {BUFFER_MIN} buffer</span>
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(court)}>
                    <Pencil aria-hidden /> Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setToArchive(court)} disabled={busyId === court.id}>
                    <Archive aria-hidden /> Archive
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {archived.length > 0 && (
        <section aria-labelledby="archived-courts-heading" className="space-y-2" data-testid="archived-courts">
          <h3 id="archived-courts-heading" className="text-sm font-semibold">
            Archived courts ({archived.length})
          </h3>
          <p className="text-xs text-[#645757]">Hidden from players and the calendar. Their bookings stay in your history.</p>
          <ul className="divide-y divide-[#d7d2cc] rounded-xl bg-[#eae6df] px-4 text-sm">
            {archived.map((court) => (
              <li key={court.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{court.name}</span> <span className="text-[#645757]">· {SPORT_LABEL[court.sport]}</span>
                </span>
                <Button variant="outline" size="sm" onClick={() => restore(court)} disabled={busyId === court.id}>
                  {busyId === court.id ? <Loader2 className="animate-spin" aria-hidden /> : <ArchiveRestore aria-hidden />} Restore
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialog open={toArchive !== null} onOpenChange={(o) => !o && busyId === null && setToArchive(null)}>
        <DialogContent className="bg-[#eae6df] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Archive {toArchive?.name}?</DialogTitle>
            <DialogDescription>
              It disappears from your public page and the booking calendar. Past bookings and revenue stay in your history, and you can restore the court later. A court with upcoming bookings cannot be archived.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setToArchive(null)} disabled={busyId !== null}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={archive} disabled={busyId !== null}>
              {busyId !== null && <Loader2 className="animate-spin" aria-hidden />}
              Archive court
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CourtDialog
        key={editing === null ? 'closed' : editing === 'new' ? 'new' : editing.id}
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          router.refresh()
        }}
      />
    </div>
  )
}

function CourtDialog({
  target,
  onClose,
  onSaved,
}: {
  target: ManagedCourt | 'new' | null
  onClose: () => void
  onSaved: () => void
}) {
  const existing = target && target !== 'new' ? target : null
  const [form, setForm] = React.useState<CourtFormInput>(
    existing
      ? {
          name: existing.name,
          sport: existing.sport,
          pricePerHour: String(existing.pricePerHour),
          nightSurchargePerHour: String(existing.nightSurchargePerHour),
          nightStartsAt: existing.nightStartsAt,
          status: existing.status,
        }
      : EMPTY_FORM
  )
  const [errors, setErrors] = React.useState<Record<string, string[] | undefined>>({})
  const [saving, setSaving] = React.useState(false)

  const set = <K extends keyof CourtFormInput>(key: K, value: CourtFormInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = courtFormSchema.safeParse(form)
    if (!parsed.success) {
      setErrors(parsed.error.flatten().fieldErrors)
      return
    }
    setErrors({})
    setSaving(true)
    const result = await saveCourt(existing?.id ?? null, form)
    setSaving(false)
    if (!result.ok) {
      if (result.fieldErrors) setErrors(result.fieldErrors)
      return void toast.error(result.message)
    }
    toast.success(existing ? 'Court updated' : 'Court added')
    onSaved()
  }

  const err = (k: keyof CourtFormInput) => errors[k]?.[0]
  const sportMinutes = SPORT_DURATION_MIN[form.sport as Sport] ?? SPORT_DURATION_MIN.padel

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-[#eae6df] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit court' : 'Add court'}</DialogTitle>
          <DialogDescription>
            {sportMinutes} min slots with a {BUFFER_MIN} min buffer, set by the sport.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field id="court-name" label="Court name" error={err('name')}>
            <Input
              id="court-name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Court 1 - Panoramic Padel"
              error={Boolean(err('name'))}
              maxLength={80}
            />
          </Field>

          <Field id="court-sport" label="Sport" error={err('sport')}>
            <Select value={form.sport} onValueChange={(v) => set('sport', v)}>
              <SelectTrigger id="court-sport" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="padel">Padel</SelectItem>
                <SelectItem value="tennis">Tennis</SelectItem>
                <SelectItem value="football">Football</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field id="court-price" label="Base price (TND / hour)" error={err('pricePerHour')}>
            <Input
              id="court-price"
              inputMode="decimal"
              value={form.pricePerHour}
              onChange={(e) => set('pricePerHour', e.target.value)}
              placeholder="60"
              error={Boolean(err('pricePerHour'))}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id="court-night" label="Night surcharge (TND / h)" error={err('nightSurchargePerHour')}>
              <Input
                id="court-night"
                inputMode="decimal"
                value={form.nightSurchargePerHour}
                onChange={(e) => set('nightSurchargePerHour', e.target.value)}
                error={Boolean(err('nightSurchargePerHour'))}
              />
            </Field>
            <Field id="court-night-from" label="Night starts at" error={err('nightStartsAt')}>
              <Input
                id="court-night-from"
                type="time"
                value={form.nightStartsAt}
                onChange={(e) => set('nightStartsAt', e.target.value)}
                error={Boolean(err('nightStartsAt'))}
              />
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-[#f7f5f2] px-3 py-2.5">
            <Label htmlFor="court-active" className="text-sm">
              {form.status === 'active' ? 'Active: players can book it' : 'Maintenance: hidden from booking'}
            </Label>
            <Switch
              id="court-active"
              checked={form.status === 'active'}
              onCheckedChange={(v) => set('status', v ? 'active' : 'maintenance')}
            />
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-[#1d3023] text-[#f7f5f2] hover:bg-[#1d3023]/90">
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              {existing ? 'Save changes' : 'Add court'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
