import { z } from 'zod'

/** The email box on /forgot-password. */
export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
})

/**
 * The new password on /reset-password. Same limits as sign-up (8 characters minimum;
 * 72 is bcrypt's byte limit, longer passwords would be silently truncated) plus a
 * matching confirmation. Supabase additionally refuses weak or leaked passwords when
 * that protection is switched on, and a password equal to the current one.
 */
export const newPasswordSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password must be at most 72 characters'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'The two passwords do not match' })

export type NewPasswordInput = z.infer<typeof newPasswordSchema>
