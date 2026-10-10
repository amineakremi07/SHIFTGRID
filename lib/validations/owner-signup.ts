import { z } from 'zod'

import { termsConsentSchema } from '@/lib/validations/player-auth'
import { stripHtml } from '@/lib/sanitize-text'

export const companyDetailsSchema = z.object({
  companyName: z.string().min(2, 'Le nom de l\'entreprise doit contenir au moins 2 caractères').max(100),
  registryNumber: z.string()
    .regex(/^\d{14}$/, 'Le numéro de registre doit comporter 14 chiffres (Registre de commerce tunisien)')
    .optional()
    .or(z.literal('')),
  address: z.string().trim().min(5, 'L\'adresse doit contenir au moins 5 caractères').max(200).transform(stripHtml),
  city: z.string().trim().min(2, 'La ville est obligatoire').max(100).transform(stripHtml),
  postalCode: z.string().regex(/^\d{4}$/, 'Le code postal doit comporter 4 chiffres').optional().or(z.literal('')),
  phone: z.string().regex(/^\+216\s?\d{2}\s?\d{3}\s?\d{3}$/, 'Le téléphone doit être au format tunisien : +216 XX XXX XXX'),
  email: z.string().email('Adresse e-mail invalide'),
  sportTypes: z.array(z.enum(['padel', 'tennis', 'football'])).min(1, 'Sélectionnez au moins un sport'),
  courtCounts: z.object({
    padel: z.number().min(0).max(20).default(0).optional(),
    tennis: z.number().min(0).max(20).default(0).optional(),
    football: z.number().min(0).max(10).default(0).optional(),
  }),
  openTime: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Format d\'heure invalide (HH:MM)'),
  closeTime: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Format d\'heure invalide (HH:MM)'),
  employeeCount: z.number().min(1).max(100).default(1).optional(),
})

export const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  addressConfirm: z.string().min(5, 'La confirmation de l\'adresse est obligatoire'),
})

export const documentSchema = z.object({
  // Required: a club cannot be verified without its registration proof.
  verificationDoc: z.instanceof(File, { message: 'Veuillez téléverser votre document de vérification' }).refine(
    (file) => file.size <= 5 * 1024 * 1024,
    'Le fichier doit faire moins de 5 Mo'
  ).refine(
    (file) => ['application/pdf', 'image/jpeg', 'image/png'].includes(file.type),
    'Le fichier doit être au format PDF, JPEG ou PNG'
  ),
})

export const ownerAccountSchema = z.object({
  ownerName: z.string().min(2, 'Le nom doit contenir au moins 2 caractères').max(100),
  ownerEmail: z.string().email('Adresse e-mail invalide'),
  ownerPhone: z.string().regex(/^\+216\s?\d{2}\s?\d{3}\s?\d{3}$/, 'Le téléphone doit être au format tunisien : +216 XX XXX XXX'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
  confirmPassword: z.string(),
  acceptTerms: termsConsentSchema,
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirmPassword'],
})

export const ownerSignupSchema = z.object({
  company: companyDetailsSchema,
  location: locationSchema,
  document: documentSchema,
  owner: ownerAccountSchema,
})

export type CompanyDetails = z.infer<typeof companyDetailsSchema>
export type LocationData = z.infer<typeof locationSchema>
export type DocumentData = z.infer<typeof documentSchema>
export type OwnerAccount = z.infer<typeof ownerAccountSchema>
export type OwnerSignupData = z.infer<typeof ownerSignupSchema>