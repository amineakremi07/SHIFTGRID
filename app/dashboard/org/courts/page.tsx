import { redirect } from 'next/navigation'

import { CourtManager, type ManagedCourt, type ArchivedCourt } from '@/components/dashboard/court-manager'
import { getOrgAccess } from '@/lib/org-access'
import { createClient } from '@/lib/supabase/server'
import type { Sport } from '@/lib/slot-duration'

export const dynamic = 'force-dynamic'

export default async function OrgCourtsPage() {
  const access = await getOrgAccess()
  if (access.kind !== 'ok') redirect('/dashboard/org')
  if (access.ctx.role !== 'org_admin') redirect('/dashboard/org/bookings')

  const supabase = await createClient()
  const [{ data, error }, archivedRes] = await Promise.all([
    supabase
      .from('courts')
      .select('id, name, sport, status, price_per_hour, night_surcharge_per_hour, night_starts_at')
      .eq('org_id', access.ctx.orgId)
      .is('deleted_at', null) // archived courts are not part of the live list
      .order('name'),
    supabase
      .from('courts')
      .select('id, name, sport, deleted_at')
      .eq('org_id', access.ctx.orgId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false }),
  ])

  if (error) {
    console.error('Failed to load courts:', { code: error.code, message: error.message })
    return (
      <div role="alert" className="rounded-xl bg-[#eae6df] px-6 py-10 text-center text-sm">
        Impossible de charger vos terrains. Veuillez actualiser la page dans un instant.
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

  const archived: ArchivedCourt[] = (archivedRes.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    sport: c.sport as Sport,
    archivedAt: c.deleted_at as string,
  }))

  return <CourtManager courts={courts} archived={archived} />
}
