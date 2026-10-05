import { z } from 'zod'

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
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80, 'Name is too long'),
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
