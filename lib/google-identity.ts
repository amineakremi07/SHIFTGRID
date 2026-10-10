import type { User } from '@supabase/supabase-js'

/** Pure helpers about a Google sign-in (no server imports, so they are unit-tested). */

/**
 * True for an account that signs in through Google. A Google identity linked to an existing password
 * account keeps `app_metadata.provider = 'email'`, so the list of providers is checked too: that linked
 * case is exactly the one `assessGoogleSignIn` has to look at.
 */
export const isGoogleUser = (user: Pick<User, 'app_metadata'>): boolean =>
  user.app_metadata?.provider === 'google' ||
  (Array.isArray(user.app_metadata?.providers) && (user.app_metadata.providers as unknown[]).includes('google'))

type IdentityLike = { provider: string; identity_data?: Record<string, unknown> | null }

/**
 * What to do with a Google sign-in, judged from the account's identities (pure, unit-tested).
 *  - `refuse`: Google did not vouch for the address (`email_verified` is not true). Nothing may be linked.
 *  - `reset-password`: the account also holds a password identity whose address was NEVER confirmed. That is
 *    the pre-account-takeover shape: someone registered this address with their own password before its
 *    real owner arrived with Google. The Google holder owns the address, so the unproven password is killed.
 *  - `ok`: nothing suspicious (a brand-new Google account, or a password identity that was confirmed).
 * Only an explicit `email_verified: false` counts as unproven, so an older identity without the flag is not punished.
 */
export function assessGoogleSignIn(user: { identities?: IdentityLike[] | null }): 'ok' | 'refuse' | 'reset-password' {
  const identities = user.identities ?? []
  const google = identities.find((i) => i.provider === 'google')
  if (!google || google.identity_data?.email_verified !== true) return 'refuse'
  const password = identities.find((i) => i.provider === 'email')
  if (password && password.identity_data?.email_verified === false) return 'reset-password'
  return 'ok'
}
