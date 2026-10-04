import { z } from 'zod'

import { PAYMENT_CHOICES } from '@/lib/payments'

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

/** An optional address: blank means "none", anything else must be a real email. */
export const optionalEmailSchema = z
  .string()
  .trim()
  .max(254, 'Email is too long')
  .optional()
  .transform((value, ctx) => {
    if (!value) return undefined
    if (!z.string().email().safeParse(value).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid email address, or leave it blank' })
      return z.NEVER
    }
    return value.toLowerCase()
  })

/** A guest must agree to the Terms/Privacy and to being contacted about the booking. */
export const guestConsentSchema = z
  .boolean()
  .refine((v) => v === true, 'Please accept the Terms and Privacy Policy to book')

export const guestDetailsSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Please enter your full name')
    .max(100, 'Name is too long'),
  phone: guestPhoneSchema,
  /** Optional: where the confirmation, reminders and cancellation notice are sent. */
  email: optionalEmailSchema,
})

const MAX_BOOKING_AHEAD_MS = 180 * 24 * 60 * 60 * 1000
const MAX_PLAYERS = 30 // outer sanity bound; the sport's own limits are enforced by checkBookableSlot()

/** A real calendar day, YYYY-MM-DD (rejects 2026-02-31). */
export const calendarDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')
  .refine((value) => {
    const d = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value)
  }, 'Invalid date')

/** An ISO instant with offset, within a sane booking horizon (not older than a day, not beyond 180 days). */
export const bookingInstantSchema = z
  .string()
  .datetime({ offset: true, message: 'Invalid start time' })
  .refine((value) => {
    const t = Date.parse(value)
    const now = Date.now()
    return t > now - 24 * 60 * 60 * 1000 && t < now + MAX_BOOKING_AHEAD_MS
  }, 'Start time is outside the bookable range')

/** The fields that identify a slot, shared by the player flow and staff walk-ins. */
export const slotFields = {
  courtId: z.string().uuid(),
  /** Venue calendar day the slot belongs to, YYYY-MM-DD. */
  date: calendarDaySchema,
  /** Start of play as an ISO instant. The end is derived from the sport, never sent. */
  startsAt: bookingInstantSchema,
  playerCount: z.number().int().min(1).max(MAX_PLAYERS),
}

/** One invite box: blank (skipped) or a real, lower-cased email. */
const inviteEmailSchema = z
  .string()
  .trim()
  .max(254, 'Email is too long')
  .transform((value, ctx) => {
    if (!value) return ''
    if (!z.string().email().safeParse(value).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid email address, or leave it blank' })
      return z.NEVER
    }
    return value.toLowerCase()
  })

const bookingBase = {
  orgId: z.string().uuid(),
  ...slotFields,
  /** How the booker pays; defaults to cash at the club (the original behaviour). */
  payment: z.enum(PAYMENT_CHOICES).default('cash'),
  /** Split only: addresses to email the other players' payment links to, in link order. Blanks are skipped. */
  inviteEmails: z.array(inviteEmailSchema).max(3).optional(),
}

/**
 * Deliberately has no sport, price, end time or member id: the server derives those
 * from the database and the verified session so they cannot be forged from a
 * browser. The objects are `.strict()`, so a payload that tries to send them is
 * rejected outright instead of being silently ignored.
 */
export const createBookingSchema = z
  .discriminatedUnion('mode', [
    z.object({ mode: z.literal('member'), ...bookingBase }).strict(),
    z.object({ mode: z.literal('guest'), ...bookingBase, guest: guestDetailsSchema, consent: guestConsentSchema }).strict(),
  ])
  .superRefine((value, ctx) => {
    if (value.payment !== 'split' && value.inviteEmails?.some(Boolean)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['inviteEmails'], message: 'Invite emails apply only to split payments' })
    }
    if (value.inviteEmails && value.inviteEmails.length > Math.max(0, value.playerCount - 1)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['inviteEmails'], message: 'More invite addresses than other players' })
    }
  })

/** Staff walk-in: same slot fields, a guest, and no payment choice (cash at the desk). */
/** The guest booking form: details + the consent box (consent is not part of the stored details). */
export const guestBookingFormSchema = guestDetailsSchema.extend({ consent: guestConsentSchema })

/** "" from a blank form box means "not given". */
const blankToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value)

export const MANUAL_PAYMENT_STATUSES = ['paid_on_site', 'pay_at_venue'] as const
export const MANUAL_SOURCES = ['manual', 'phone'] as const

/**
 * A booking made by club staff for someone at the desk or on the phone
 * (POST /api/v1/bookings/manual). snake_case because it is a public API body.
 * Like every booking schema it is `.strict()` and has no price, sport, end time or club:
 * those come from the court row and the caller's verified session. The start is either
 * an exact instant (`starts_at`, what the dashboard sends) or `start_time` "HH:MM" on
 * `date` in venue time; the slot must be on the court's grid and its length is fixed by the sport.
 */
export const manualBookingSchema = z
  .object({
    court_id: z.string().uuid(),
    date: calendarDaySchema,
    starts_at: bookingInstantSchema.optional(),
    start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM').optional(),
    /** Defaults to the sport's first allowed size (padel 4, tennis 2, football 12). */
    player_count: z.number().int().min(1).max(MAX_PLAYERS).optional(),
    full_name: z.string().trim().min(2, 'Please enter the customer name').max(100, 'Name is too long'),
    phone: z.preprocess(blankToUndefined, guestPhoneSchema.optional()),
    email: z.preprocess(blankToUndefined, optionalEmailSchema),
    payment_status: z.enum(MANUAL_PAYMENT_STATUSES),
    notes: z.preprocess(blankToUndefined, z.string().trim().max(300, 'Notes are limited to 300 characters').optional()),
    source: z.enum(MANUAL_SOURCES).default('manual'),
  })
  .strict()
  .refine((v) => (v.starts_at === undefined) !== (v.start_time === undefined), {
    path: ['start_time'],
    message: 'Provide exactly one of starts_at or start_time',
  })

export type GuestDetailsInput = z.input<typeof guestDetailsSchema>
export type ManualBookingInput = z.input<typeof manualBookingSchema>
export type CreateBookingInput = z.input<typeof createBookingSchema>
