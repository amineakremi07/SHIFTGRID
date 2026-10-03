import { z } from 'zod'
import { guestPhoneSchema } from '@/lib/validations/booking'

/**
 * Player Auth and Anonymous Booker Validation Schemas
 * Callers: PlayerAuthModal, lib/actions/player-auth.ts, booking flow components
 * Affected API: POST /api/auth/player, POST /api/auth/anonymous
 * Data schemas: playerSignInSchema, playerSignUpSchema, anonymousBookerSchema
 * User instruction: fix the 3 bugs first then hop on next task
 */

// Tunisian phone number regex: accepts 8 digits (e.g. 98123456) or international (+216 98 123 456 / +21698123456 / 0021698123456)
export const tunisianPhoneRegex = /^(\+?216\s?|00216\s?)?[234579]\d{1}[\s.-]?\d{3}[\s.-]?\d{3}$/

/** Required consent to the Terms and Privacy Policy. Checked on the server, not just in the form. */
export const termsConsentSchema = z
  .boolean()
  .refine((v) => v === true, 'You must accept the Terms of Service and Privacy Policy to continue')

export const playerSignInSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  rememberMe: z.boolean().default(true),
})

export const playerSignUpSchema = z.object({
  displayName: z.string().min(2, 'Full name must be at least 2 characters').max(100),
  email: z.string().email('Please enter a valid email address'),
  phone: guestPhoneSchema,
  password: z.string().min(6, 'Password must be at least 6 characters'),
  orgId: z.string().uuid('Invalid organization ID'),
  rememberMe: z.boolean().default(true),
  acceptTerms: termsConsentSchema,
})

export const anonymousBookerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  phone: guestPhoneSchema,
  orgId: z.string().uuid('Invalid organization ID'),
})

/**
 * Player registration (`/register`). The club is required because a player
 * profile is linked to exactly one organization (profiles.org_id is NOT NULL).
 */
export const playerRegisterSchema = z.object({
  fullName: z.string().trim().min(2, 'Please enter your full name').max(100, 'Name is too long'),
  email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
  phone: guestPhoneSchema,
  // 72 is bcrypt's byte limit: longer passwords would be silently truncated.
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'),
  orgId: z.string().uuid('Please choose your club'),
  acceptTerms: termsConsentSchema,
})

export type PlayerSignInInput = z.infer<typeof playerSignInSchema>
export type PlayerSignUpInput = z.infer<typeof playerSignUpSchema>
export type PlayerRegisterInput = z.input<typeof playerRegisterSchema>
export type AnonymousBookerInput = z.infer<typeof anonymousBookerSchema>
