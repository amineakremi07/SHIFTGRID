'use server'

import { revalidatePath } from 'next/cache'

import { requireOrgAction } from '@/lib/org-access'
import { weeklyHoursSchema, type WeeklyHours } from '@/lib/operating-hours'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'

export type SettingsResult =
  | { ok: true }
  | { ok: false; message: string; fieldErrors?: Record<string, string> }

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
  if (!auth.ok) return auth

  const parsed = weeklyHoursSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join('.')] = issue.message
    return { ok: false, message: 'Please fix the highlighted days.', fieldErrors }
  }

  const { error } = await getSupabaseAdmin()
    .from('organizations')
    .update({ weekly_hours: parsed.data })
    .eq('id', auth.ctx.orgId)
  if (error) {
    console.error('saveWeeklyHours failed', { code: error.code, message: error.message })
    return { ok: false, message: 'Could not save the hours. Please try again.' }
  }

  revalidatePath('/dashboard/org/settings')
  revalidatePath(`/courts/${auth.ctx.orgId}`)
  return { ok: true }
}
