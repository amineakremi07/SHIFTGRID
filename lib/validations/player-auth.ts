import { z } from 'zod'
import { guestPhoneSchema } from '@/lib/validations/booking'
import { stripHtml } from '@/lib/sanitize-text'

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
  .refine((v) => v === true, 'Vous devez accepter les conditions d\'utilisation et la politique de confidentialité pour continuer')

export const playerSignInSchema = z.object({
  email: z.string().email('Veuillez saisir une adresse e-mail valide'),
  password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
  rememberMe: z.boolean().default(true),
})

export const playerSignUpSchema = z.object({
  displayName: z.string().trim().min(2, 'Le nom complet doit contenir au moins 2 caractères').max(100).transform(stripHtml),
  email: z.string().email('Veuillez saisir une adresse e-mail valide'),
  phone: guestPhoneSchema,
  password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
  orgId: z.string().uuid('Identifiant d\'organisation invalide'),
  rememberMe: z.boolean().default(true),
  acceptTerms: termsConsentSchema,
})

export const anonymousBookerSchema = z.object({
  name: z.string().trim().min(2, 'Le nom doit contenir au moins 2 caractères').max(100).transform(stripHtml),
  phone: guestPhoneSchema,
  orgId: z.string().uuid('Identifiant d\'organisation invalide'),
})

/**
 * Player registration (`/register`). The club is required because a player
 * profile is linked to exactly one organization (profiles.org_id is NOT NULL).
 */
export const playerRegisterSchema = z.object({
  fullName: z.string().trim().min(2, 'Veuillez saisir votre nom complet').max(100, 'Le nom est trop long').transform(stripHtml),
  email: z.string().trim().toLowerCase().email('Veuillez saisir une adresse e-mail valide'),
  phone: guestPhoneSchema,
  // 72 is bcrypt's byte limit: longer passwords would be silently truncated.
  password: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .max(72, 'Le mot de passe ne doit pas dépasser 72 caractères'),
  orgId: z.string().uuid('Veuillez choisir votre club'),
  acceptTerms: termsConsentSchema,
})

export type PlayerSignInInput = z.infer<typeof playerSignInSchema>
export type PlayerSignUpInput = z.infer<typeof playerSignUpSchema>
export type PlayerRegisterInput = z.input<typeof playerRegisterSchema>
export type AnonymousBookerInput = z.infer<typeof anonymousBookerSchema>
