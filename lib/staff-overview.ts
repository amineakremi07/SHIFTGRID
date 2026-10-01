import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'

export type StaffMember = { id: string; name: string; email: string | null; joinedAt: string }
export type PendingInvite = { id: string; email: string; expiresAt: string; expired: boolean; invitedAt: string }

/**
 * The team of one club. Invite tokens are deliberately NOT included: they are
 * secrets shown once to the owner, never listed. Service role (emails live in
 * auth.users), so callers must have checked the caller is this club's owner.
 */
export async function loadStaffOverview(orgId: string): Promise<
  { ok: true; staff: StaffMember[]; invites: PendingInvite[] } | { ok: false }
> {
  const admin = getSupabaseAdmin()

  const [staffRes, inviteRes] = await Promise.all([
    admin
      .from('profiles')
      .select('id, display_name, created_at')
      .eq('org_id', orgId)
      .eq('role', 'staff')
      .order('created_at'),
    admin
      .from('staff_invites')
      .select('id, email, expires_at, created_at')
      .eq('org_id', orgId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false }),
  ])
  if (staffRes.error || inviteRes.error) {
    console.error('loadStaffOverview failed', { staff: staffRes.error?.message, invites: inviteRes.error?.message })
    return { ok: false }
  }

  const staff: StaffMember[] = await Promise.all(
    (staffRes.data ?? []).map(async (p) => {
      const { data } = await admin.auth.admin.getUserById(p.id)
      return { id: p.id, name: p.display_name, email: data.user?.email ?? null, joinedAt: p.created_at }
    })
  )

  const now = Date.now()
  const invites: PendingInvite[] = (inviteRes.data ?? []).map((i) => ({
    id: i.id,
    email: i.email,
    expiresAt: i.expires_at,
    expired: Date.parse(i.expires_at) < now,
    invitedAt: i.created_at,
  }))

  return { ok: true, staff, invites }
}
