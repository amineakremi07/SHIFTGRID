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
    if (!result.ok) {
      if (result.fieldErrors) {
        setErrors(Object.fromEntries(Object.entries(result.fieldErrors).map(([k, v]) => [k.split('.')[0], v])))
      }
      return void toast.error(result.message)
    }
    toast.success('Operating hours saved')
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-6" noValidate>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Operating hours</h2>
        <p className="text-sm text-[#645757]">
          Players can only book inside these hours. A closing time at or before the opening time means the club
          closes after midnight (00:00 = midnight).
          {!configured && ' Until you save, each court uses its own default hours.'}
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
                  aria-label={`${WEEKDAY_LABELS[day]} open`}
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
                    aria-label={`${WEEKDAY_LABELS[day]} opening time`}
                    error={Boolean(error)}
                  />
                  <span className="text-[#645757]">to</span>
                  <Input
                    type="time"
                    value={d.to}
                    onChange={(e) => update(day, { to: e.target.value })}
                    className="w-32"
                    aria-label={`${WEEKDAY_LABELS[day]} closing time`}
                    error={Boolean(error)}
                  />
                </div>
              ) : (
                <span className="text-sm text-[#645757]">Closed</span>
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
          Save hours
        </Button>
        <Button type="button" variant="outline" className="h-9" onClick={copyMondayToAll}>
          Copy Monday to all days
        </Button>
      </div>
    </form>
  )
}
