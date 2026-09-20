import { z } from 'zod'

/**
 * Player Auth and Anonymous Booker Validation Schemas
 * Callers: PlayerAuthModal, lib/actions/player-auth.ts, booking flow components
 * Affected API: POST /api/auth/player, POST /api/auth/anonymous
 * Data schemas: playerSignInSchema, playerSignUpSchema, anonymousBookerSchema
 * User instruction: fix the 3 bugs first then hop on next task
 */

// Tunisian phone number regex: accepts 8 digits (e.g. 98123456) or international (+216 98 123 456 / +21698123456 / 0021698123456)
export const tunisianPhoneRegex = /^(\+?216\s?|00216\s?)?[234579]\d{1}[\s.-]?\d{3}[\s.-]?\d{3}$/

export const playerSignInSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  rememberMe: z.boolean().default(true),
})

export const playerSignUpSchema = z.object({
  displayName: z.string().min(2, 'Full name must be at least 2 characters').max(100),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().regex(tunisianPhoneRegex, 'Please enter a valid Tunisian phone number (e.g., 98 123 456)'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  orgId: z.string().uuid('Invalid organization ID'),
  rememberMe: z.boolean().default(true),
})

export const anonymousBookerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  phone: z.string().regex(tunisianPhoneRegex, 'Please enter a valid Tunisian phone number (e.g., 98 123 456)'),
  orgId: z.string().uuid('Invalid organization ID'),
})

export type PlayerSignInInput = z.infer<typeof playerSignInSchema>
export type PlayerSignUpInput = z.infer<typeof playerSignUpSchema>
export type AnonymousBookerInput = z.infer<typeof anonymousBookerSchema>
