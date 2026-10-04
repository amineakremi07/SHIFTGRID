import Link from 'next/link'
import { redirect } from 'next/navigation'

import { OrgSwitcher } from '@/components/dashboard/org-switcher'
import { getAdminAccess } from '@/lib/admin/access'
import { getMemberships, hasMultipleMemberships } from '@/lib/org-memberships'

/**
 * Platform admin area. The proxy already sends signed-out users to login; this is
 * the authoritative server-side check (role `platform_admin`) for every request.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await getAdminAccess()
  if (access.kind === 'signed_out') redirect('/login-owner?redirect=/admin/verification')
  if (access.kind === 'forbidden') redirect('/')
  // A platform admin sees ONLY the clubs they were explicitly added to; there is no list of all clubs here.
  const memberships = await getMemberships()
  const canSwitch = hasMultipleMemberships(memberships.items)

  return (
    <div className="min-h-screen bg-[#f7f5f2] text-[#2a1a1d]">
      <header className="bg-[#1d3023] text-[#f7f5f2]">
        <div className="mx-auto flex w-full max-w-[1700px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-6 lg:px-8 xl:px-12">
          <div>
            <p className="text-xs uppercase tracking-wider text-[#f7f5f2]/70">Platform admin</p>
            <h1 className="text-xl font-semibold tracking-tight">Club verification</h1>
          </div>
          <div className="flex items-center gap-5 text-sm">
            {canSwitch && <OrgSwitcher items={memberships.items} activeOrgId={memberships.activeOrgId} />}
            <Link href="/" className="text-[#f7f5f2]/80 underline-offset-4 hover:underline">
              View public site
            </Link>
            <span className="text-[#f7f5f2]/70">{access.displayName}</span>
            <form action="/logout" method="post">
              <button type="submit" className="text-[#f7f5f2]/80 underline-offset-4 hover:underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1700px] px-4 py-8 sm:px-6 lg:px-8 xl:px-12">{children}</main>
    </div>
  )
}
