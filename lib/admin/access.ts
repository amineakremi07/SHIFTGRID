import { cache } from 'react'

import { sessionNeedsSecondFactor } from '@/lib/mfa-guard'
import { getSessionProfile } from '@/lib/org-access'

export type AdminAccess =
  | { kind: 'signed_out' }
  | { kind: 'mfa_required' }
  | { kind: 'forbidden' }
  | { kind: 'ok'; userId: string; displayName: string }

/**
 * Is the caller a platform admin? Derived from the verified session and the
 * caller's own profile row. (The DB role is `platform_admin`; there is no
 * `super_admin` value, the profiles CHECK would reject it.)
 */
export const getAdminAccess = cache(async (): Promise<AdminAccess> => {
  const { supabase, user, profile } = await getSessionProfile()
  if (!user) return { kind: 'signed_out' }
  if (await sessionNeedsSecondFactor(supabase, user)) return { kind: 'mfa_required' }

  if (profile?.role !== 'platform_admin') return { kind: 'forbidden' }

  return { kind: 'ok', userId: user.id, displayName: profile.display_name }
})

export type AdminActionAuth = { ok: true; userId: string } | { ok: false; message: string }

/** Guard for Server Actions and queries that use the service-role client. */
export async function requireAdmin(): Promise<AdminActionAuth> {
  const access = await getAdminAccess()
  if (access.kind === 'signed_out') return { ok: false, message: 'Please sign in again.' }
  if (access.kind === 'mfa_required') return { ok: false, message: 'Enter your two-factor code to continue.' }
  if (access.kind !== 'ok') return { ok: false, message: 'Platform admin access required.' }
  return { ok: true, userId: access.userId }
}
