'use server'

import { revalidatePath } from 'next/cache'

import { actionFail, actionFailFromZod, actionOk, type ActionResult } from '@/lib/actions/result'
import { requireOrgAction } from '@/lib/org-access'
import { weeklyHoursSchema, type WeeklyHours } from '@/lib/operating-hours'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'

export type SettingsResult = ActionResult

/**
 * Save the club's weekly hours.
 *
 * Uses the service-role client because org_admin deliberately has no UPDATE
 * policy on `organizations` (status and verification live there). Authorization
 * is therefore the role check below, and only `weekly_hours` is written, always
 * for the caller's own organization.
 */
export async function saveWeeklyHours(input: WeeklyHours): Promise<SettingsResult> {
  const auth = await requireOrgAction(['org_admin'])
  if (!auth.ok) return actionFail(auth.message)

  const parsed = weeklyHoursSchema.safeParse(input)
  if (!parsed.success) {
    return actionFailFromZod('Please fix the highlighted days.', parsed.error)
  }

  const { error } = await getSupabaseAdmin()
    .from('organizations')
    .update({ weekly_hours: parsed.data })
    .eq('id', auth.ctx.orgId)
  if (error) {
    console.error('saveWeeklyHours failed', { code: error.code, message: error.message })
    return actionFail('Could not save the hours. Please try again.')
  }

  revalidatePath('/dashboard/org/settings')
  revalidatePath(`/courts/${auth.ctx.orgId}`)
  return actionOk()
}
