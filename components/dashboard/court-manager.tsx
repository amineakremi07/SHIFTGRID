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
import { issuesToFieldErrors } from '@/lib/actions/result'
import { slotHoursLabel, slotPrice } from '@/lib/pricing'
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
  pricePerSlot: '',
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
    if (!result.success) {
      toast.error(result.error)
      setToArchive(null) // the message says why (e.g. upcoming bookings); nothing more to confirm
      return
    }
    toast.success(`${toArchive.name} archivé. Son historique de réservations est conservé.`)
    setToArchive(null)
    router.refresh()
  }

  const restore = async (court: ArchivedCourt) => {
    setBusyId(court.id)
    const result = await restoreCourtAction(court.id)
    setBusyId(null)
    if (!result.success) return void toast.error(result.error)
    toast.success(`${court.name} est de retour`)
    router.refresh()
  }

  const toggleStatus = async (court: ManagedCourt, active: boolean) => {
    setBusyId(court.id)
    const result = await setCourtStatus(court.id, active ? 'active' : 'maintenance')
    setBusyId(null)
    if (!result.success) return void toast.error(result.error)
    toast.success(active ? `${court.name} est de nouveau réservable` : `${court.name} est en maintenance`)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Terrains</h2>
          <p className="text-sm text-[#645757]">
            Les prix sont par créneau, en TND. La durée du créneau suit le sport (padel et football 1 h 30, tennis 1 h) et ne peut pas être modifiée.
          </p>
        </div>
        <Button
          onClick={() => setEditing('new')}
          className="h-9 bg-[#1d3023] px-3 text-[#f7f5f2] hover:bg-[#1d3023]/90"
        >
          <Plus aria-hidden /> Ajouter un terrain
        </Button>
      </div>

      {courts.length === 0 ? (
        <div className="rounded-xl bg-[#eae6df] px-6 py-12 text-center">
          <p className="text-lg font-semibold">Aucun terrain pour le moment</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-sm text-[#645757]">
            Ajoutez votre premier terrain pour que les joueurs puissent réserver.
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
                      <Badge variant={active ? 'success' : 'warning'}>{active ? 'Actif' : 'Maintenance'}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {busyId === court.id && <Loader2 className="size-4 animate-spin" aria-hidden />}
                    <Switch
                      checked={active}
                      disabled={busyId === court.id}
                      onCheckedChange={(v) => toggleStatus(court, v)}
                      aria-label={`${court.name} est réservable`}
                    />
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-[#645757]">Prix de base</dt>
                    <dd className="font-medium">
                      {tnd(slotPrice(court.pricePerHour, SPORT_DURATION_MIN[court.sport]))}
                      <span className="text-[#645757]"> / {slotHoursLabel(SPORT_DURATION_MIN[court.sport])}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#645757]">Éclairage de nuit</dt>
                    <dd className="font-medium">
                      {court.nightSurchargePerHour > 0
                        ? `+${tnd(court.nightSurchargePerHour)} à partir de ${court.nightStartsAt}`
                        : 'Aucun'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#645757]">Créneau</dt>
                    <dd className="font-medium">
                      {SPORT_DURATION_MIN[court.sport]} min
                      <span className="text-[#645757]"> + {BUFFER_MIN} de battement</span>
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(court)}>
                    <Pencil aria-hidden /> Modifier
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setToArchive(court)} disabled={busyId === court.id}>
                    <Archive aria-hidden /> Archiver
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
            Terrains archivés ({archived.length})
          </h3>
          <p className="text-xs text-[#645757]">Masqués pour les joueurs et dans le calendrier. Leurs réservations restent dans votre historique.</p>
          <ul className="divide-y divide-[#d7d2cc] rounded-xl bg-[#eae6df] px-4 text-sm">
            {archived.map((court) => (
              <li key={court.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{court.name}</span> <span className="text-[#645757]">· {SPORT_LABEL[court.sport]}</span>
                </span>
                <Button variant="outline" size="sm" onClick={() => restore(court)} disabled={busyId === court.id}>
                  {busyId === court.id ? <Loader2 className="animate-spin" aria-hidden /> : <ArchiveRestore aria-hidden />} Restaurer
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialog open={toArchive !== null} onOpenChange={(o) => !o && busyId === null && setToArchive(null)}>
        <DialogContent className="bg-[#eae6df] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Archiver {toArchive?.name} ?</DialogTitle>
            <DialogDescription>
              Il disparaît de votre page publique et du calendrier de réservation. Les réservations passées et les revenus restent dans votre historique, et vous pourrez restaurer le terrain plus tard. Un terrain avec des réservations à venir ne peut pas être archivé.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setToArchive(null)} disabled={busyId !== null}>
              Le conserver
            </Button>
            <Button variant="destructive" onClick={archive} disabled={busyId !== null}>
              {busyId !== null && <Loader2 className="animate-spin" aria-hidden />}
              Archiver le terrain
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
          pricePerSlot: String(slotPrice(existing.pricePerHour, SPORT_DURATION_MIN[existing.sport])),
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
    if (!result.success) {
      if (result.issues) setErrors(issuesToFieldErrors(result.issues))
      return void toast.error(result.error)
    }
    toast.success(existing ? 'Terrain mis à jour' : 'Terrain ajouté')
    onSaved()
  }

  const err = (k: keyof CourtFormInput) => errors[k]?.[0]
  const sportMinutes = SPORT_DURATION_MIN[form.sport as Sport] ?? SPORT_DURATION_MIN.padel

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-[#eae6df] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? 'Modifier le terrain' : 'Ajouter un terrain'}</DialogTitle>
          <DialogDescription>
            Créneaux de {sportMinutes} min avec un battement de {BUFFER_MIN} min, définis par le sport.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field id="court-name" label="Nom du terrain" error={err('name')}>
            <Input
              id="court-name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Terrain 1 - Padel panoramique"
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

          <Field id="court-price" label={`Prix d'un créneau de ${slotHoursLabel(sportMinutes)} (TND)`} error={err('pricePerSlot')}>
            <Input
              id="court-price"
              inputMode="decimal"
              value={form.pricePerSlot}
              onChange={(e) => set('pricePerSlot', e.target.value)}
              placeholder={sportMinutes === 60 ? '40' : '60'}
              error={Boolean(err('pricePerSlot'))}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id="court-night" label="Supplément de nuit (TND)" error={err('nightSurchargePerHour')}>
              <Input
                id="court-night"
                inputMode="decimal"
                value={form.nightSurchargePerHour}
                onChange={(e) => set('nightSurchargePerHour', e.target.value)}
                error={Boolean(err('nightSurchargePerHour'))}
              />
            </Field>
            <Field id="court-night-from" label="La nuit commence à" error={err('nightStartsAt')}>
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
              {form.status === 'active' ? 'Actif : les joueurs peuvent le réserver' : 'Maintenance : masqué à la réservation'}
            </Label>
            <Switch
              id="court-active"
              checked={form.status === 'active'}
              onCheckedChange={(v) => set('status', v ? 'active' : 'maintenance')}
            />
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving} className="bg-[#1d3023] text-[#f7f5f2] hover:bg-[#1d3023]/90">
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              {existing ? 'Enregistrer les modifications' : 'Ajouter le terrain'}
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
