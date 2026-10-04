'use server'

import { revalidatePath } from 'next/cache'

import { reportServerError } from '@/lib/observability'
import { actionRateLimit } from '@/lib/rate-limit'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import { createClient } from '@/lib/supabase/server'

export type SwitchResult = { ok: true; path: string } | { ok: false; message: string }

/**
 * Make another organization the account's ACTIVE one. The caller is the verified session
 * user, never an argument, and the database function only accepts an organization the
 * account has an explicit `organization_members` row for (otherwise `not_a_member`).
 * Being a platform admin gives no right to any club: a club only appears in the switcher
 * if someone added that membership on purpose.
 *
 * The active organization lives on the profile (not in a cookie): it is what every RLS
 * policy reads, it cannot be forged from the browser, and it follows the account across
 * devices. The answer says where to go next.
 */
export async function switchOrganizationAction(orgId: string): Promise<SwitchResult> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgId)) {
    return { ok: false, message: 'Invalid organization.' }
  }

  const {
    data: { user },
  } = await (await createClient()).auth.getUser()
  if (!user) return { ok: false, message: 'Please sign in again.' }

  const limited = await actionRateLimit('lookup', user.id)
  if (limited) return { ok: false, message: limited }

  const { data, error } = await getSupabaseAdmin().rpc('switch_active_organization', { p_user_id: user.id, p_org_id: orgId })
  if (error) {
    if (error.message?.includes('not_a_member')) return { ok: false, message: 'You are not a member of that organization.' }
    console.error('switchOrganization failed', { code: error.code, message: error.message })
    reportServerError('org-switch', new Error(`switch_active_organization failed: ${error.code ?? 'unknown'}`), { code: error.code ?? null })
    return { ok: false, message: 'Could not switch organization. Please try again.' }
  }

  // Every layout and page depends on who the account is acting as.
  revalidatePath('/', 'layout')
  const role = (data as { role: string }).role
  return { ok: true, path: role === 'platform_admin' ? '/admin/verification' : '/dashboard/org' }
}
