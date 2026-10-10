'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { saveWeeklyHours } from '@/lib/actions/org-settings'
import {
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  weeklyHoursSchema,
  type DayHours,
  type WeekdayKey,
  type WeeklyHours,
} from '@/lib/operating-hours'

export function HoursForm({ initial, configured }: { initial: WeeklyHours; configured: boolean }) {
  const router = useRouter()
  const [hours, setHours] = React.useState<WeeklyHours>(initial)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)

  const update = (day: WeekdayKey, patch: Partial<DayHours>) =>
    setHours((h) => ({ ...h, [day]: { ...h[day], ...patch } }))

  const copyMondayToAll = () =>
    setHours((h) => Object.fromEntries(WEEKDAY_KEYS.map((k) => [k, { ...h.mon }])) as WeeklyHours)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = weeklyHoursSchema.safeParse(hours)
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0] as string, i.message])))
      return
    }
    setErrors({})
    setSaving(true)
    const result = await saveWeeklyHours(hours)
    setSaving(false)
    if (!result.success) {
      if (result.issues) {
        setErrors(Object.fromEntries(result.issues.map((i) => [String(i.path[0]), i.message])))
      }
      return void toast.error(result.error)
    }
    toast.success('Horaires d\'ouverture enregistrés')
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-6" noValidate>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Horaires d&apos;ouverture</h2>
        <p className="text-sm text-[#645757]">
          Les joueurs ne peuvent réserver que pendant ces horaires. Une heure de fermeture égale ou antérieure à l&apos;heure
          d&apos;ouverture signifie que le club ferme après minuit (00:00 = minuit).
          {!configured && ' Tant que vous n\'enregistrez pas, chaque terrain utilise ses propres horaires par défaut.'}
        </p>
      </div>

      <ul className="divide-y divide-[#d7d2cc] rounded-xl bg-[#eae6df]">
        {WEEKDAY_KEYS.map((day) => {
          const d = hours[day]
          const error = errors[day]
          return (
            <li key={day} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
              <div className="flex w-44 items-center gap-3">
                <Switch
                  checked={d.open}
                  onCheckedChange={(v) => update(day, { open: v })}
                  aria-label={`${WEEKDAY_LABELS[day]} ouvert`}
                />
                <span className="font-medium">{WEEKDAY_LABELS[day]}</span>
              </div>

              {d.open ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={d.from}
                    onChange={(e) => update(day, { from: e.target.value })}
                    className="w-32"
                    aria-label={`${WEEKDAY_LABELS[day]} heure d'ouverture`}
                    error={Boolean(error)}
                  />
                  <span className="text-[#645757]">à</span>
                  <Input
                    type="time"
                    value={d.to}
                    onChange={(e) => update(day, { to: e.target.value })}
                    className="w-32"
                    aria-label={`${WEEKDAY_LABELS[day]} heure de fermeture`}
                    error={Boolean(error)}
                  />
                </div>
              ) : (
                <span className="text-sm text-[#645757]">Fermé</span>
              )}

              {error && (
                <p role="alert" className="w-full text-xs text-destructive">
                  {error}
                </p>
              )}
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving} className="h-9 bg-[#1d3023] px-4 text-[#f7f5f2] hover:bg-[#1d3023]/90">
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          Enregistrer les horaires
        </Button>
        <Button type="button" variant="outline" className="h-9" onClick={copyMondayToAll}>
          Copier le lundi sur tous les jours
        </Button>
      </div>
    </form>
  )
}
