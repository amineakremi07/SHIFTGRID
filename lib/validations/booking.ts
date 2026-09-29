import { z } from 'zod'

/**
 * Tunisian mobile number -> canonical "+216XXXXXXXX", or null if invalid.
 *
 * Accepts the 8 national digits with or without +216 / 00216 / 216, and with
 * spaces, dots, dashes or brackets. The first digit must be 2, 4, 5 or 9 (mobile
 * ranges); 3 and 7 are landline/other ranges and are rejected.
 */
export function normalizeTunisianMobile(input: string): string | null {
  let digits = input.replace(/[\s.\-()]/g, '')
  if (digits.startsWith('+216')) digits = digits.slice(4)
  else if (digits.startsWith('00216')) digits = digits.slice(5)
  else if (digits.startsWith('216') && digits.length === 11) digits = digits.slice(3)

  return /^[2459]\d{7}$/.test(digits) ? `+216${digits}` : null
}

export const guestPhoneSchema = z
  .string()
  .trim()
  .min(1, 'Phone number is required')
  .transform((value, ctx) => {
    const normalized = normalizeTunisianMobile(value)
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a valid Tunisian mobile number (8 digits starting with 2, 4, 5 or 9)',
      })
      return z.NEVER
    }
    return normalized
  })

export const guestDetailsSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Please enter your full name')
    .max(100, 'Name is too long'),
  phone: guestPhoneSchema,
})

const bookingBase = {
  orgId: z.string().uuid(),
  courtId: z.string().uuid(),
  /** Venue calendar day the slot belongs to, YYYY-MM-DD. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Start of play as an ISO instant. */
  startsAt: z.string().datetime({ offset: true }),
  playerCount: z.number().int(),
}

/**
 * Deliberately has no sport, price or member id: the server derives those from
 * the database and the verified session so they cannot be forged from a browser.
 */
export const createBookingSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('member'), ...bookingBase }),
  z.object({ mode: z.literal('guest'), ...bookingBase, guest: guestDetailsSchema }),
])

export type GuestDetailsInput = z.input<typeof guestDetailsSchema>
export type CreateBookingInput = z.input<typeof createBookingSchema>
