import type { SupabaseClient, User } from '@supabase/supabase-js'

import { needsSecondFactor } from '@/lib/mfa'

/**
 * True when this session must still enter its authenticator code. The proxy enforces it by URL, but a Server
 * Action can be POSTed to any URL with its action id, so every server-side access check (getOrgAccess,
 * getAdminAccess, the session-authenticated API routes) calls this too: the rule then holds wherever the
 * protected work actually runs. `user` must come from getUser() (the auth server), never from the cookie.
 */
export async function sessionNeedsSecondFactor(supabase: SupabaseClient, user: User): Promise<boolean> {
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  return needsSecondFactor(user.factors, aal?.currentLevel)
}
