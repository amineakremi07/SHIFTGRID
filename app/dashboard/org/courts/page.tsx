import { redirect } from 'next/navigation'

import { CourtManager, type ManagedCourt } from '@/components/dashboard/court-manager'
import { getOrgAccess } from '@/lib/org-access'
import { createClient } from '@/lib/supabase/server'
import type { Sport } from '@/lib/slot-duration'

export const dynamic = 'force-dynamic'

export default async function OrgCourtsPage() {
  const access = await getOrgAccess()
  if (access.kind !== 'ok') redirect('/dashboard/org')
  if (access.ctx.role !== 'org_admin') redirect('/dashboard/org/bookings')

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('courts')
    .select('id, name, sport, status, price_per_hour, night_surcharge_per_hour, night_starts_at')
    .eq('org_id', access.ctx.orgId)
    .order('name')

  if (error) {
    console.error('Failed to load courts:', { code: error.code, message: error.message })
    return (
      <div role="alert" className="rounded-xl bg-[#eae6df] px-6 py-10 text-center text-sm">
        We couldn&apos;t load your courts. Please refresh in a moment.
      </div>
    )
  }

  const courts: ManagedCourt[] = (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    sport: c.sport as Sport,
    status: c.status,
    pricePerHour: Number(c.price_per_hour),
    nightSurchargePerHour: Number(c.night_surcharge_per_hour),
    nightStartsAt: c.night_starts_at.slice(0, 5),
  }))

  return <CourtManager courts={courts} />
}
