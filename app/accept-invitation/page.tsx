import Link from 'next/link'
import { redirect } from 'next/navigation'

import { AcceptInvitationForm } from '@/components/auth/accept-invitation-form'
import { AuthCard } from '@/components/auth/auth-card'
import { Button } from '@/components/ui/button'
import { findPendingInviteForEmail } from '@/lib/staff-invite-core'
import { createClient } from '@/lib/supabase/server'

/** A personal page reached from an email link: never cached, indexed or leaked by referrer. */
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Accepter l\'invitation', robots: { index: false, follow: false }, referrer: 'no-referrer' as const }

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
      <Notice title="Ouvrez votre lien d'invitation">
        <p>
          Ouvrez le lien de votre e-mail d&apos;invitation pour rejoindre le club. S&apos;il a expiré, ou si votre compte est déjà configuré, connectez-vous ci-dessous ; sinon demandez au propriétaire du club
          d&apos;envoyer une nouvelle invitation.
        </p>
        <Button asChild className="w-full">
          <Link href="/login-owner">Aller à la connexion</Link>
        </Button>
      </Notice>
    )
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile) {
    return (
      <Notice title="Votre compte est déjà configuré">
        <p>Ce compte appartient déjà à un club : il n&apos;y a plus rien à accepter.</p>
        <Button asChild className="w-full">
          <Link href={profile.role === 'platform_admin' ? '/admin/verification' : '/dashboard/org/bookings'}>Continuer</Link>
        </Button>
      </Notice>
    )
  }

  const invite = await findPendingInviteForEmail(user.email)
  if (!invite) {
    return (
      <Notice title="Aucune invitation ouverte">
        <p>
          Il n&apos;y a aucune invitation ouverte pour <strong>{user.email}</strong>. Elle a peut-être expiré ou été retirée : demandez au propriétaire du club d&apos;en envoyer une nouvelle.
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link href="/">Retour à ShiftGrid</Link>
        </Button>
      </Notice>
    )
  }

  return <AcceptInvitationForm clubName={invite.clubName} email={invite.email} />
}
