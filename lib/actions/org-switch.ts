'use server'

import { actionFail, actionOk, type ActionResult } from '@/lib/actions/result'
import { revalidatePath } from 'next/cache'

import { reportServerError } from '@/lib/observability'
import { actionRateLimit } from '@/lib/rate-limit'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import { sessionNeedsSecondFactor } from '@/lib/mfa-guard'
import { createClient } from '@/lib/supabase/server'

export type SwitchResult = ActionResult<{ path: string }>

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
    return actionFail('Invalid organization.')
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return actionFail('Please sign in again.')
  if (await sessionNeedsSecondFactor(supabase, user)) return actionFail('Enter your two-factor code to continue.')

  const limited = await actionRateLimit('lookup', user.id)
  if (limited) return actionFail(limited)

  const { data, error } = await getSupabaseAdmin().rpc('switch_active_organization', { p_user_id: user.id, p_org_id: orgId })
  if (error) {
    if (error.message?.includes('not_a_member')) return actionFail('You are not a member of that organization.')
    console.error('switchOrganization failed', { code: error.code, message: error.message })
    reportServerError('org-switch', new Error(`switch_active_organization failed: ${error.code ?? 'unknown'}`), { code: error.code ?? null })
    return actionFail('Could not switch organization. Please try again.')
  }

  // Every layout and page depends on who the account is acting as.
  revalidatePath('/', 'layout')
  const role = (data as { role: string }).role
  return actionOk({ path: role === 'platform_admin' ? '/admin/verification' : '/dashboard/org' })
}
