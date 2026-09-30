import { redirect } from 'next/navigation'

import { HoursForm } from '@/components/dashboard/hours-form'
import { getOrgAccess } from '@/lib/org-access'
import { DEFAULT_WEEKLY_HOURS, parseWeeklyHours } from '@/lib/operating-hours'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function OrgSettingsPage() {
  const access = await getOrgAccess()
  if (access.kind !== 'ok') redirect('/dashboard/org')
  if (access.ctx.role !== 'org_admin') redirect('/dashboard/org/bookings')

  const supabase = await createClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('weekly_hours')
    .eq('id', access.ctx.orgId)
    .maybeSingle()

  const saved = parseWeeklyHours(org?.weekly_hours)
  return <HoursForm initial={saved ?? DEFAULT_WEEKLY_HOURS} configured={Boolean(saved)} />
}
