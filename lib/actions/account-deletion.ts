'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { actionFail, actionFailFromZod, actionOk, type ActionResult } from '@/lib/actions/result'
import { reportServerError } from '@/lib/observability'
import { actionRateLimit } from '@/lib/rate-limit'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import { createClient } from '@/lib/supabase/server'

export type DeleteAccountResult = ActionResult<{ bookingsKept: number; bookingsCancelled: number }>

const inputSchema = z.object({
  password: z.string().min(1, 'Saisissez votre mot de passe.').max(200),
  confirmation: z.literal('DELETE', { errorMap: () => ({ message: 'Saisissez DELETE pour confirmer.' }) }),
})

/**
 * A player erases themselves (the right to be forgotten). The PERSON goes, the HISTORY stays:
 * `anonymize_player()` (see supabase/migrations/20261010000001) turns the profile into "Joueur Anonyme",
 * removes the phone, scrambles the login and ends every session, erases staff notes and notification
 * addresses tied to the player's bookings, and cancels upcoming bookings so no slot stays held. Past
 * bookings, the booking count and the trust / no-show counters remain, anonymously, for the clubs'
 * accounting and the platform's statistics.
 *
 * It cannot be done by accident or from a stolen session: it needs the account PASSWORD again and a typed
 * confirmation. Players only (clubs and staff are removed through their own flows). The account being
 * erased is always the verified session's, never an argument.
 */
export async function deleteMyAccountAction(input: { password: string; confirmation: string }): Promise<DeleteAccountResult> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) return actionFailFromZod(parsed.error.issues[0].message, parsed.error)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return actionFail('Veuillez vous reconnecter.')

  const limited = await actionRateLimit('auth', user.id)
  if (limited) return actionFail(limited)

  const admin = getSupabaseAdmin()
  const { data: profile } = await admin.from('profiles').select('role, anonymized_at').eq('id', user.id).maybeSingle()
  if (!profile) return actionFail('Votre compte est introuvable.')
  if (profile.role !== 'player') {
    return actionFail('Les comptes de club sont supprimés par le propriétaire du club ou par le support. Veuillez nous contacter.')
  }
  if (profile.anonymized_at) return actionFail('Ce compte a déjà été supprimé.')

  // Re-authenticate: a separate client, so this check never touches the visitor's own session.
  const checker = createAnonClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: check, error: authError } = await checker.auth.signInWithPassword({ email: user.email, password: parsed.data.password })
  if (authError || check.user?.id !== user.id) return actionFail('Ce mot de passe est incorrect.')

  const { data, error } = await admin.rpc('anonymize_player', { p_user_id: user.id })
  if (error) {
    if (error.message.includes('already_anonymized')) return actionFail('Ce compte a déjà été supprimé.')
    console.error('deleteMyAccount failed', { code: error.code, message: error.message })
    reportServerError('account.delete', new Error(`anonymize_player failed: ${error.code ?? 'unknown'}`), { code: error.code ?? null })
    return actionFail('Impossible de supprimer votre compte. Veuillez réessayer ou contacter le support.')
  }

  // The database already ended the sessions; this clears the browser's cookies too.
  await supabase.auth.signOut().catch(() => {})
  revalidatePath('/', 'layout')

  const row = data as { bookings_kept: number; bookings_cancelled: number }
  return actionOk({ bookingsKept: row.bookings_kept, bookingsCancelled: row.bookings_cancelled })
}
