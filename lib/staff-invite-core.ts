import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'

/**
 * Server-side lookup for the Supabase-link invitation landing (/accept-invitation). Not a 'use server'
 * module on purpose: that would make it a public endpoint. The organization always comes from OUR
 * `staff_invites` row (written by an owner), never from the link, the browser or the Supabase user's
 * metadata, so an invited address can only ever join the club that invited it.
 */

export type PendingInvite = {
  id: string
  orgId: string
  email: string
  clubName: string
}

/** The newest usable invitation for an address: unaccepted, unexpired, club approved and not archived. */
export async function findPendingInviteForEmail(email: string | null | undefined): Promise<PendingInvite | null> {
  const address = email?.trim().toLowerCase()
  if (!address) return null
  const admin = getSupabaseAdmin()

  const { data: invites } = await admin
    .from('staff_invites')
    .select('id, org_id, email, expires_at')
    .eq('email', address)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(5)

  for (const invite of invites ?? []) {
    const { data: org } = await admin.from('organizations').select('name, status, deleted_at').eq('id', invite.org_id).maybeSingle()
    if (org && org.status === 'approved' && org.deleted_at === null) {
      return { id: invite.id, orgId: invite.org_id, email: invite.email, clubName: org.name }
    }
  }
  return null
}
