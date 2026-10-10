import { z } from 'zod'
import { timeToMinutes } from '@/lib/court-time'

/**
 * Weekly operating hours of a club (organizations.weekly_hours).
 *
 * When set, a day's hours replace every court's own open/close time for that
 * weekday, and a closed day has no slots. When null, courts keep their own hours.
 */

export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number]

export const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  mon: 'Lundi',
  tue: 'Mardi',
  wed: 'Mercredi',
  thu: 'Jeudi',
  fri: 'Vendredi',
  sat: 'Samedi',
  sun: 'Dimanche',
}

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Utilisez le format HH:MM (24 h)')

export const dayHoursSchema = z
  .object({ open: z.boolean(), from: hhmm, to: hhmm })
  .refine((d) => !d.open || d.from !== d.to, {
    message: 'L\'heure d\'ouverture et de fermeture doivent être différentes',
    path: ['to'],
  })

export const weeklyHoursSchema = z.object({
  mon: dayHoursSchema,
  tue: dayHoursSchema,
  wed: dayHoursSchema,
  thu: dayHoursSchema,
  fri: dayHoursSchema,
  sat: dayHoursSchema,
  sun: dayHoursSchema,
})

export type DayHours = z.infer<typeof dayHoursSchema>
export type WeeklyHours = z.infer<typeof weeklyHoursSchema>

export const DEFAULT_WEEKLY_HOURS: WeeklyHours = Object.fromEntries(
  WEEKDAY_KEYS.map((k) => [k, { open: true, from: '08:00', to: '00:00' }])
) as WeeklyHours

/** Parse whatever is stored; anything malformed counts as "not configured". */
export function parseWeeklyHours(value: unknown): WeeklyHours | null {
  const parsed = weeklyHoursSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** Weekday key of a venue calendar date (YYYY-MM-DD). */
export function weekdayKey(dateStr: string): WeekdayKey {
  const [y, m, d] = dateStr.split('-').map(Number)
  const sundayFirst = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return WEEKDAY_KEYS[(sundayFirst + 6) % 7]
}

/**
 * The hours that apply to a court on a date: the club's weekly hours if set,
 * otherwise the court's own. Null = closed that day.
 */
export function effectiveHours(
  weekly: WeeklyHours | null,
  dateStr: string,
  court: { open_time: string; close_time: string }
): { openTime: string; closeTime: string } | null {
  if (!weekly) return { openTime: court.open_time, closeTime: court.close_time }
  const day = weekly[weekdayKey(dateStr)]
  if (!day.open) return null
  return { openTime: day.from, closeTime: day.to }
}

/** "08:00" / "08:00:00" to a stable "08:00". */
export function toHHMM(time: string): string {
  const m = timeToMinutes(time)
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
