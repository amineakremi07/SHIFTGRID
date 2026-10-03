import { z } from 'zod'

import { termsConsentSchema } from '@/lib/validations/player-auth'

export const companyDetailsSchema = z.object({
  companyName: z.string().min(2, 'Company name must be at least 2 characters').max(100),
  registryNumber: z.string()
    .regex(/^\d{14}$/, 'Registry number must be 14 digits (Tunisia Registre de Commerce)')
    .optional()
    .or(z.literal('')),
  address: z.string().min(5, 'Address must be at least 5 characters').max(200),
  city: z.string().min(2, 'City is required').max(100),
  postalCode: z.string().regex(/^\d{4}$/, 'Postal code must be 4 digits').optional().or(z.literal('')),
  phone: z.string().regex(/^\+216\s?\d{2}\s?\d{3}\s?\d{3}$/, 'Phone must be Tunisian format: +216 XX XXX XXX'),
  email: z.string().email('Invalid email address'),
  sportTypes: z.array(z.enum(['padel', 'tennis', 'football'])).min(1, 'Select at least one sport'),
  courtCounts: z.object({
    padel: z.number().min(0).max(20).default(0).optional(),
    tennis: z.number().min(0).max(20).default(0).optional(),
    football: z.number().min(0).max(10).default(0).optional(),
  }),
  openTime: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Invalid time format (HH:MM)'),
  closeTime: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Invalid time format (HH:MM)'),
  employeeCount: z.number().min(1).max(100).default(1).optional(),
})

export const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  addressConfirm: z.string().min(5, 'Address confirmation required'),
})

export const documentSchema = z.object({
  // Required: a club cannot be verified without its registration proof.
  verificationDoc: z.instanceof(File, { message: 'Please upload your verification document' }).refine(
    (file) => file.size <= 5 * 1024 * 1024,
    'File must be less than 5MB'
  ).refine(
    (file) => ['application/pdf', 'image/jpeg', 'image/png'].includes(file.type),
    'File must be PDF, JPEG, or PNG'
  ),
})

export const ownerAccountSchema = z.object({
  ownerName: z.string().min(2, 'Name must be at least 2 characters').max(100),
  ownerEmail: z.string().email('Invalid email address'),
  ownerPhone: z.string().regex(/^\+216\s?\d{2}\s?\d{3}\s?\d{3}$/, 'Phone must be Tunisian format: +216 XX XXX XXX'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  acceptTerms: termsConsentSchema,
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
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