'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { reportServerError } from '@/lib/observability'
import { actionRateLimit } from '@/lib/rate-limit'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import { createClient } from '@/lib/supabase/server'

export type DeleteAccountResult =
  | { ok: true; bookingsKept: number; bookingsCancelled: number }
  | { ok: false; message: string }

const inputSchema = z.object({
  password: z.string().min(1, 'Enter your password.').max(200),
  confirmation: z.literal('DELETE', { errorMap: () => ({ message: 'Type DELETE to confirm.' }) }),
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
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return { ok: false, message: 'Please sign in again.' }

  const limited = await actionRateLimit('auth', user.id)
  if (limited) return { ok: false, message: limited }

  const admin = getSupabaseAdmin()
  const { data: profile } = await admin.from('profiles').select('role, anonymized_at').eq('id', user.id).maybeSingle()
  if (!profile) return { ok: false, message: 'We could not find your account.' }
  if (profile.role !== 'player') {
    return { ok: false, message: 'Club accounts are removed by the club owner or by support. Please contact us.' }
  }
  if (profile.anonymized_at) return { ok: false, message: 'This account was already deleted.' }

  // Re-authenticate: a separate client, so this check never touches the visitor's own session.
  const checker = createAnonClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: check, error: authError } = await checker.auth.signInWithPassword({ email: user.email, password: parsed.data.password })
  if (authError || check.user?.id !== user.id) return { ok: false, message: 'That password is not correct.' }

  const { data, error } = await admin.rpc('anonymize_player', { p_user_id: user.id })
  if (error) {
    if (error.message.includes('already_anonymized')) return { ok: false, message: 'This account was already deleted.' }
    console.error('deleteMyAccount failed', { code: error.code, message: error.message })
    reportServerError('account.delete', new Error(`anonymize_player failed: ${error.code ?? 'unknown'}`), { code: error.code ?? null })
    return { ok: false, message: 'We could not delete your account. Please try again or contact support.' }
  }

  // The database already ended the sessions; this clears the browser's cookies too.
  await supabase.auth.signOut().catch(() => {})
  revalidatePath('/', 'layout')

  const row = data as { bookings_kept: number; bookings_cancelled: number }
  return { ok: true, bookingsKept: row.bookings_kept, bookingsCancelled: row.bookings_cancelled }
}
