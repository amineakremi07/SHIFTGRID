import { redirect } from 'next/navigation'

import { MfaSetup } from '@/components/dashboard/mfa-setup'
import { checkMFAStatus } from '@/lib/actions/mfa'
import { getAdminAccess } from '@/lib/admin/access'

export const dynamic = 'force-dynamic'

/** Account security for platform admins (the admin layout already guards the role). */
export default async function AdminSecurityPage() {
  const access = await getAdminAccess()
  if (access.kind !== 'ok') redirect('/')

  const status = await checkMFAStatus()
  const factors = status.ok && status.signedIn ? status.factors : []

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Security</h1>
      <MfaSetup factors={factors} />
    </div>
  )
}
