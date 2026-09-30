import { cache } from 'react'

import { createClient } from '@/lib/supabase/server'
import type { OrgStatus, UserRole } from '@/lib/types/database'

export type OrgContext = {
  userId: string
  role: 'org_admin' | 'staff'
  orgId: string
  orgName: string
  orgStatus: OrgStatus
  /** Why the club was rejected, when it was. */
  rejectionReason: string | null
  displayName: string
}

export type OrgAccess =
  | { kind: 'signed_out' }
  | { kind: 'platform_admin' }
  /** Signed in, but not an owner or staff member of any club. */
  | { kind: 'not_staff'; role: UserRole | null }
  | { kind: 'ok'; ctx: OrgContext }

/**
 * Who is calling, and for which club. Always derived from the verified session
 * (getUser) and the caller's own profile row, never from request input, so every
 * dashboard page and Server Action can trust `ctx.orgId`.
 */
export const getOrgAccess = cache(async (): Promise<OrgAccess> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { kind: 'signed_out' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id, display_name')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) return { kind: 'not_staff', role: null }
  if (profile.role === 'platform_admin') return { kind: 'platform_admin' }
  if (profile.role !== 'org_admin' && profile.role !== 'staff') {
    return { kind: 'not_staff', role: profile.role }
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, status, rejection_reason')
    .eq('id', profile.org_id)
    .maybeSingle()
  if (!org) return { kind: 'not_staff', role: profile.role }

  return {
    kind: 'ok',
    ctx: {
      userId: user.id,
      role: profile.role,
      orgId: org.id,
      orgName: org.name,
      orgStatus: org.status,
      rejectionReason: org.rejection_reason,
      displayName: profile.display_name,
    },
  }
})

export type ActionAuth = { ok: true; ctx: OrgContext } | { ok: false; message: string }

/**
 * Guard for Server Actions. `roles` limits who may act; the club must be
 * approved (a pending or suspended club cannot take bookings or change data).
 */
export async function requireOrgAction(roles: ReadonlyArray<'org_admin' | 'staff'>): Promise<ActionAuth> {
  const access = await getOrgAccess()
  if (access.kind === 'signed_out') return { ok: false, message: 'Please sign in again.' }
  if (access.kind !== 'ok') return { ok: false, message: 'You do not have access to a club dashboard.' }
  if (!roles.includes(access.ctx.role)) {
    return { ok: false, message: 'Only the club owner can do this.' }
  }
  if (access.ctx.orgStatus !== 'approved') {
    return { ok: false, message: 'Your club is not approved yet.' }
  }
  return { ok: true, ctx: access.ctx }
}
