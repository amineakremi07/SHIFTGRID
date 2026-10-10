import { redirect } from 'next/navigation'

import { MfaSetup } from '@/components/dashboard/mfa-setup'
import { checkMFAStatus } from '@/lib/actions/mfa'
import { getOrgAccess } from '@/lib/org-access'

export const dynamic = 'force-dynamic'

/** Account security for everyone who signs in to a club dashboard (owner and staff). */
export default async function OrgSecurityPage() {
  const access = await getOrgAccess()
  if (access.kind !== 'ok') redirect('/dashboard/org')

  const status = await checkMFAStatus()
  const factors = status.ok && status.signedIn ? status.factors : []

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Sécurité</h1>
      <MfaSetup factors={factors} />
    </div>
  )
}
