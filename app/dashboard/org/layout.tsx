import { redirect } from 'next/navigation'

import { Notifications } from '@/components/dashboard/notifications'
import { OrgNav } from '@/components/dashboard/org-nav'
import { OrgSwitcher } from '@/components/dashboard/org-switcher'
import { getOrgAccess } from '@/lib/org-access'
import { getMemberships, hasMultipleMemberships } from '@/lib/org-memberships'

/**
 * Club owner & staff portal. The proxy already requires a session for
 * /dashboard; this layout adds the role + organization check, on the server, on
 * every request. (Pages and Server Actions re-check via lib/org-access.ts, since
 * layouts do not re-render on every navigation.)
 */
export default async function OrgDashboardLayout({ children }: { children: React.ReactNode }) {
  const access = await getOrgAccess()

  if (access.kind === 'signed_out') redirect('/login-owner?redirect=/dashboard/org/bookings')
  if (access.kind === 'mfa_required') redirect('/auth/mfa-verify?redirect=/dashboard/org/bookings')
  if (access.kind === 'platform_admin') redirect('/admin/verification')
  if (access.kind === 'not_staff') redirect('/register?role=owner')

  const { ctx } = access
  // Only an account explicitly added to several organizations gets a switcher; a normal owner never sees one.
  const memberships = await getMemberships()
  const canSwitch = hasMultipleMemberships(memberships.items)

  return (
    <div className="min-h-screen bg-[#f7f5f2] text-[#2a1a1d]">
      <header className="bg-[#1d3023] text-[#f7f5f2]">
        <div className="mx-auto flex w-full max-w-[1920px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-6 lg:px-8 xl:px-12">
          <div>
            <p className="text-xs uppercase tracking-wider text-[#f7f5f2]/70">
              {ctx.role === 'org_admin' ? 'Espace propriétaire' : 'Espace équipe'}
            </p>
            <h1 className="text-xl font-semibold tracking-tight">{ctx.orgName}</h1>
          </div>
          <OrgNav role={ctx.role} />
          <div className="flex items-center gap-3">
            {canSwitch && <OrgSwitcher items={memberships.items} activeOrgId={ctx.orgId} />}
            {/* Live booking alerts: only meaningful once the club is approved and taking bookings. */}
            {ctx.orgStatus === 'approved' && <Notifications orgId={ctx.orgId} />}
            <form action="/logout" method="post">
              <button type="submit" className="text-sm text-[#f7f5f2]/80 underline-offset-4 hover:underline">
                Se déconnecter
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1920px] px-4 py-8 sm:px-6 lg:px-8 xl:px-12">
        {ctx.orgStatus !== 'approved' ? (
          <div role="status" className="rounded-xl bg-[#eae6df] px-6 py-10 text-center">
            <p className="text-lg font-semibold">
              {ctx.archived
                ? 'Ce club a été fermé'
                : ctx.orgStatus === 'pending'
                  ? 'Votre club est en attente de vérification'
                  : `Votre club est ${ctx.orgStatus === 'suspended' ? 'suspendu' : ctx.orgStatus === 'rejected' ? 'refusé' : ctx.orgStatus}`}
            </p>
            <p className="mx-auto mt-1 max-w-[52ch] text-sm text-[#645757]">
              {ctx.archived
                ? 'Le club a été archivé : il n\'est plus listé et ne peut plus recevoir de réservations. Son historique de réservations est conservé. Contactez le support pour le rouvrir.'
                : ctx.orgStatus === 'pending'
                  ? 'Un administrateur de la plateforme examine votre inscription. Les terrains et les réservations seront débloqués une fois celle-ci approuvée.'
                  : 'Les réservations et la gestion des terrains sont indisponibles. Veuillez contacter le support.'}
            </p>
            {ctx.orgStatus === 'rejected' && ctx.rejectionReason && (
              <p className="mx-auto mt-3 max-w-[52ch] rounded-lg bg-[#f7f5f2] px-4 py-3 text-sm">
                <span className="text-[#645757]">Motif : </span>
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
