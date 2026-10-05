import { cache } from 'react'

import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import { createClient } from '@/lib/supabase/server'
import type { OrgStatus } from '@/lib/types/database'

export type MembershipRole = 'org_admin' | 'staff' | 'platform_admin'

export type Membership = {
  orgId: string
  name: string
  role: MembershipRole
  status: OrgStatus
  /** Soft-deleted: listed so the account can still see it, but closed. */
  archived: boolean
}

/** Shown in the switcher next to a club's name. */
export const MEMBERSHIP_ROLE_LABEL: Record<MembershipRole, string> = {
  org_admin: 'Owner',
  staff: 'Staff',
  platform_admin: 'Platform admin',
}

/**
 * Every organization the signed-in account is EXPLICITLY a member of (rows in
 * `organization_members`), and which one is active right now (`profiles.org_id`).
 * The caller's id comes from the verified session; the rows are the caller's own (RLS
 * lets a user read only theirs). Names are looked up with the service role because a
 * club that is pending or suspended is hidden from the user's own client; only the ids
 * of THEIR memberships are queried.
 *
 * There is deliberately no "all organizations" variant here: a platform admin sees
 * the clubs they were explicitly added to, never the others.
 */
export const getMemberships = cache(async (): Promise<{ activeOrgId: string | null; items: Membership[] }> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { activeOrgId: null, items: [] }

  const [rows, profile] = await Promise.all([
    supabase.from('organization_members').select('org_id, role').eq('user_id', user.id),
    supabase.from('profiles').select('org_id').eq('id', user.id).maybeSingle(),
  ])
  const members = rows.data ?? []
  if (members.length === 0) return { activeOrgId: profile.data?.org_id ?? null, items: [] }

  const { data: orgs } = await getSupabaseAdmin()
    .from('organizations')
    .select('id, name, status, deleted_at')
    .in('id', members.map((m) => m.org_id))
  const byId = new Map((orgs ?? []).map((o) => [o.id, o]))

  const items: Membership[] = members
    .flatMap((m) => {
      const org = byId.get(m.org_id)
      return org ? [{ orgId: org.id, name: org.name, role: m.role as MembershipRole, status: org.status as OrgStatus, archived: Boolean(org.deleted_at) }] : []
    })
    // The platform context first, then clubs by name.
    .sort((a, b) => (a.role === 'platform_admin' ? -1 : b.role === 'platform_admin' ? 1 : a.name.localeCompare(b.name)))

  return { activeOrgId: profile.data?.org_id ?? null, items }
})

/** The switcher only exists for an account that belongs to more than one organization. */
export const hasMultipleMemberships = (items: readonly Membership[]) => items.length >= 2
