import { z } from 'zod'
import { stripHtml } from '@/lib/sanitize-text'

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h)')

/** TND amount with at most 2 decimals, typed as text in a form (comma or dot). */
const tnd = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .transform((v) => Number(v.replace(',', '.')))
    .pipe(
      z
        .number({ invalid_type_error: `${label} must be a number` })
        .min(0, `${label} cannot be negative`)
        .max(10000, `${label} is too high`)
        .refine((n) => Math.round(n * 100) / 100 === n, `${label} can have at most 2 decimals`)
    )

export const courtFormSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80, 'Name is too long').transform(stripHtml),
  sport: z.enum(['padel', 'tennis', 'football']),
  pricePerSlot: tnd('Slot price'),
  nightSurchargePerHour: tnd('Surcharge'),
  nightStartsAt: hhmm,
  status: z.enum(['active', 'maintenance']),
})

/** Raw form state: numbers are typed as text and coerced by the schema. */
export type CourtFormInput = {
  name: string
  sport: string
  /** Price of ONE slot (the sport sets its length), not an hourly rate. */
  pricePerSlot: string
  nightSurchargePerHour: string
  nightStartsAt: string
  status: string
}
export type CourtFormValues = z.output<typeof courtFormSchema>

/**
 * Body of POST /api/v1/courts. Same limits as the dashboard form (`courtFormSchema`): name 2-80 characters
 * with markup stripped, sport and status from the same lists, money in TND with at most 2 decimals and an
 * upper bound of 10 000. Money here is HOURLY (the dashboard form takes the price of one slot). Legacy
 * aliases `sport_type` and `is_active` are still accepted; unknown keys are ignored.
 */
const apiTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Use HH:MM')
const apiMoney = (label: string) =>
  z
    .number({ invalid_type_error: `${label} must be a number` })
    .finite(`${label} must be a number`)
    .min(0, `${label} cannot be negative`)
    .max(10000, `${label} is too high`)
    .refine((n) => Math.round(n * 100) / 100 === n, `${label} can have at most 2 decimals`)

export const apiCourtCreateSchema = z
  .object({
    name: z.string().trim().min(2, 'name must be at least 2 characters').max(80, 'name is too long').transform(stripHtml),
    sport: z.enum(['padel', 'tennis', 'football']).optional(),
    sport_type: z.enum(['padel', 'tennis', 'football']).optional(),
    price_per_hour: apiMoney('price_per_hour'),
    status: z.enum(['active', 'maintenance']).optional(),
    is_active: z.boolean().optional(),
    open_time: apiTime.nullish(),
    close_time: apiTime.nullish(),
    night_starts_at: apiTime.nullish(),
    night_surcharge_per_hour: apiMoney('night_surcharge_per_hour').nullish(),
  })
  .refine((v) => v.sport !== undefined || v.sport_type !== undefined, { message: 'sport is required', path: ['sport'] })
