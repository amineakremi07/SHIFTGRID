import { redirect } from 'next/navigation'

import { Notifications } from '@/components/dashboard/notifications'
import { OrgNav } from '@/components/dashboard/org-nav'
import { getOrgAccess } from '@/lib/org-access'

/**
 * Club owner & staff portal. The proxy already requires a session for
 * /dashboard; this layout adds the role + organization check, on the server, on
 * every request. (Pages and Server Actions re-check via lib/org-access.ts, since
 * layouts do not re-render on every navigation.)
 */
export default async function OrgDashboardLayout({ children }: { children: React.ReactNode }) {
  const access = await getOrgAccess()

  if (access.kind === 'signed_out') redirect('/login-owner?redirect=/dashboard/org/bookings')
  if (access.kind === 'platform_admin') redirect('/admin/verification')
  if (access.kind === 'not_staff') redirect('/register?role=owner')

  const { ctx } = access

  return (
    <div className="min-h-screen bg-[#f7f5f2] text-[#2a1a1d]">
      <header className="bg-[#1d3023] text-[#f7f5f2]">
        <div className="mx-auto flex w-full max-w-[1920px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-6 lg:px-8 xl:px-12">
          <div>
            <p className="text-xs uppercase tracking-wider text-[#f7f5f2]/70">
              {ctx.role === 'org_admin' ? 'Owner' : 'Staff'} portal
            </p>
            <h1 className="text-xl font-semibold tracking-tight">{ctx.orgName}</h1>
          </div>
          <OrgNav role={ctx.role} />
          <div className="flex items-center gap-3">
            {/* Live booking alerts: only meaningful once the club is approved and taking bookings. */}
            {ctx.orgStatus === 'approved' && <Notifications orgId={ctx.orgId} />}
            <form action="/logout" method="post">
              <button type="submit" className="text-sm text-[#f7f5f2]/80 underline-offset-4 hover:underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1920px] px-4 py-8 sm:px-6 lg:px-8 xl:px-12">
        {ctx.orgStatus !== 'approved' ? (
          <div role="status" className="rounded-xl bg-[#eae6df] px-6 py-10 text-center">
            <p className="text-lg font-semibold">
              {ctx.orgStatus === 'pending' ? 'Your club is awaiting verification' : `Your club is ${ctx.orgStatus}`}
            </p>
            <p className="mx-auto mt-1 max-w-[52ch] text-sm text-[#645757]">
              {ctx.orgStatus === 'pending'
                ? 'A platform admin is reviewing your registration. Courts and bookings unlock once it is approved.'
                : 'Bookings and court management are unavailable. Please contact support.'}
            </p>
            {ctx.orgStatus === 'rejected' && ctx.rejectionReason && (
              <p className="mx-auto mt-3 max-w-[52ch] rounded-lg bg-[#f7f5f2] px-4 py-3 text-sm">
                <span className="text-[#645757]">Reason: </span>
                {ctx.rejectionReason}
              </p>
            )}
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  )
}
