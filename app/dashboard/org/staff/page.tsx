import { redirect } from 'next/navigation'

import { StaffManager } from '@/components/dashboard/staff-manager'
import { getOrgAccess } from '@/lib/org-access'
import { loadStaffOverview } from '@/lib/staff-overview'

export const dynamic = 'force-dynamic'

export default async function OrgStaffPage() {
  const access = await getOrgAccess()
  if (access.kind !== 'ok') redirect('/dashboard/org')
  // Staff run the bookings; only the owner manages the team.
  if (access.ctx.role !== 'org_admin') redirect('/dashboard/org/bookings')

  const overview = await loadStaffOverview(access.ctx.orgId)
  if (!overview.ok) {
    return (
      <div role="alert" className="rounded-xl bg-[#eae6df] px-6 py-10 text-center text-sm">
        We couldn&apos;t load your team. Please refresh in a moment.
      </div>
    )
  }

  return <StaffManager staff={overview.staff} invites={overview.invites} />
}
