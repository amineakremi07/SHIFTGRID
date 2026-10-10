import { z } from 'zod'

/** The email box on /forgot-password. */
export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Veuillez saisir une adresse e-mail valide'),
})

/**
 * The new password on /reset-password. Same limits as sign-up (8 characters minimum;
 * 72 is bcrypt's byte limit, longer passwords would be silently truncated) plus a
 * matching confirmation. Supabase additionally refuses weak or leaked passwords when
 * that protection is switched on, and a password equal to the current one.
 */
export const newPasswordSchema = z
  .object({
    password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères').max(72, 'Le mot de passe ne doit pas dépasser 72 caractères'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Les deux mots de passe ne correspondent pas' })

export type NewPasswordInput = z.infer<typeof newPasswordSchema>
