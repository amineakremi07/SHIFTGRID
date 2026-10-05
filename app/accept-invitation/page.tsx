import Link from 'next/link'
import { redirect } from 'next/navigation'

import { AcceptInvitationForm } from '@/components/auth/accept-invitation-form'
import { AuthCard } from '@/components/auth/auth-card'
import { Button } from '@/components/ui/button'
import { findPendingInviteForEmail } from '@/lib/staff-invite-core'
import { createClient } from '@/lib/supabase/server'

/** A personal page reached from an email link: never cached, indexed or leaked by referrer. */
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Accept invitation', robots: { index: false, follow: false }, referrer: 'no-referrer' as const }

const TOKEN = /^[0-9a-f]{64}$/

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <AuthCard title={title}>
      <div role="status" className="space-y-4 text-sm">
        {children}
      </div>
    </AuthCard>
  )
}

/**
 * The invitation landing. Two kinds of link end up here, and neither may 404:
 *  - our own emailed link carries `?token=<64 hex>` (the club owner's invitation): it is handed to
 *    /accept-invite, which creates the account from that token;
 *  - a link sent by Supabase Auth (an invitation from its dashboard or API) goes through
 *    /auth/callback, which signs the invitee in and sends them here: they choose a name and a
 *    password, and the club comes from the owner's own `staff_invites` record for their address.
 */
export default async function AcceptInvitationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  if (token && TOKEN.test(token)) redirect(`/accept-invite?token=${token}`)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <Notice title="Open your invitation link">
        <p>
          Open the link from your invitation email to join the club. If it has expired, or you were already set up, sign in below; otherwise ask the club
          owner to send a new invitation.
        </p>
        <Button asChild className="w-full">
          <Link href="/login-owner">Go to login</Link>
        </Button>
      </Notice>
    )
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile) {
    return (
      <Notice title="You are already set up">
        <p>This account already belongs to a club, so there is nothing left to accept.</p>
        <Button asChild className="w-full">
          <Link href={profile.role === 'platform_admin' ? '/admin/verification' : '/dashboard/org/bookings'}>Continue</Link>
        </Button>
      </Notice>
    )
  }

  const invite = await findPendingInviteForEmail(user.email)
  if (!invite) {
    return (
      <Notice title="No open invitation">
        <p>
          There is no open invitation for <strong>{user.email}</strong>. It may have expired or been withdrawn: ask the club owner to send a new one.
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link href="/">Back to ShiftGrid</Link>
        </Button>
      </Notice>
    )
  }

  return <AcceptInvitationForm clubName={invite.clubName} email={invite.email} />
}
