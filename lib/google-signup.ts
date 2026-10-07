import type { User } from '@supabase/supabase-js'

import { consentMetadata } from '@/lib/legal'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'

/** True for an account whose sign-in went through Google. */
export const isGoogleUser = (user: Pick<User, 'app_metadata'>): boolean => user.app_metadata?.provider === 'google'

/**
 * First Google sign-in at a club: create the player profile (a player belongs to ONE club, and no
 * database trigger makes profiles). The club must be approved and not archived. Terms acceptance is
 * recorded in the account metadata, like every other sign-up path (the Google button says that
 * continuing means accepting the Terms and Privacy Policy). Returns false when no profile was made.
 */
export async function createGooglePlayerProfile(user: User, orgId: string): Promise<boolean> {
  const admin = getSupabaseAdmin()
  const { data: org } = await admin
    .from('organizations')
    .select('id')
    .eq('id', orgId)
    .eq('status', 'approved')
    .is('deleted_at', null)
    .maybeSingle()
  if (!org) return false

  const meta = user.user_metadata ?? {}
  const name = String(meta.full_name ?? meta.name ?? user.email?.split('@')[0] ?? 'Player')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 100)

  const { error } = await admin.from('profiles').insert({
    id: user.id,
    org_id: orgId,
    role: 'player',
    display_name: name.length >= 2 ? name : 'Player',
  })
  if (error) {
    console.error('google sign-up: profile insert failed', { code: error.code, message: error.message })
    return false
  }
  await admin.auth.admin.updateUserById(user.id, { user_metadata: { ...meta, ...consentMetadata() } })
  return true
}
