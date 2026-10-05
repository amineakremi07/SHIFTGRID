'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'

import { sendStaffInviteEmail } from '@/lib/email/staff-invite'
import { requireOrgAction } from '@/lib/org-access'
import { findPendingInviteForEmail } from '@/lib/staff-invite-core'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import { actionRateLimit } from '@/lib/rate-limit'

/**
 * Staff management for club owners.
 *
 * Owners (`org_admin`) invite people as `staff`. Staff can run the day-to-day
 * (bookings, walk-ins, cancellations) but never change courts, prices, hours or
 * the team: those actions all require `org_admin` (see lib/org-access.ts).
 *
 * Everything here uses the service-role client after a server-side role check,
 * and the organization always comes from the caller's own profile, never from
 * input. Invite tokens are secrets: they are emailed and shown once to the owner
 * and are never returned in a list.
 */

const INVITE_DAYS = 7
const TOKEN = /^[0-9a-f]{64}$/

export type StaffResult = { ok: true } | { ok: false; message: string }
export type InviteActionResult =
  | { ok: true; inviteUrl: string; emailSent: boolean }
  | { ok: false; message: string }

async function appOrigin() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

/** Auth users are looked up by email through the admin API (there is no by-email getter). */
async function emailHasAccount(email: string): Promise<boolean> {
  const admin = getSupabaseAdmin()
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    if (data.users.some((u) => u.email?.toLowerCase() === email)) return true
    if (data.users.length < 200) return false
  }
  return false
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
})

async function mintToken(): Promise<string | null> {
  const { data } = await getSupabaseAdmin().rpc('generate_invite_token')
  return typeof data === 'string' && TOKEN.test(data) ? data : null
}

async function sendInvite(args: {
  email: string
  token: string
  orgId: string
  inviterId: string
}): Promise<{ inviteUrl: string; emailSent: boolean }> {
  const admin = getSupabaseAdmin()
  const [{ data: org }, { data: inviter }] = await Promise.all([
    admin.from('organizations').select('name').eq('id', args.orgId).maybeSingle(),
    admin.from('profiles').select('display_name').eq('id', args.inviterId).maybeSingle(),
  ])
  const inviteUrl = `${await appOrigin()}/accept-invite?token=${args.token}`
  const sent = await sendStaffInviteEmail({
    email: args.email,
    token: args.token,
    organizationName: org?.name ?? 'ShiftGrid',
    role: 'staff',
    invitedByName: inviter?.display_name ?? 'The club owner',
    inviteUrl,
  })
  return { inviteUrl, emailSent: sent.success }
}

/** Invite someone as staff. Owner only. */
export async function inviteStaff(input: { email: string }): Promise<InviteActionResult> {
  const auth = await requireOrgAction(['org_admin'])
  if (!auth.ok) return auth

  const parsed = inviteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message }
  const { email } = parsed.data
  const admin = getSupabaseAdmin()

  const { data: open } = await admin
    .from('staff_invites')
    .select('id')
    .eq('org_id', auth.ctx.orgId)
    .ilike('email', email)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .limit(1)
  if (open?.length) {
    return { ok: false, message: 'This email already has a pending invitation. Use Resend to get a fresh link.' }
  }

  // An account that already exists (a player, another club's owner...) cannot be
  // turned into staff here: that could silently move someone out of their club.
  if (await emailHasAccount(email)) {
    return {
      ok: false,
      message: 'That email already has a ShiftGrid account. Invite a different email address for staff access.',
    }
  }

  const token = await mintToken()
  if (!token) return { ok: false, message: 'Could not create the invitation. Please try again.' }

  const { error } = await admin.from('staff_invites').insert({
    org_id: auth.ctx.orgId,
    email,
    role: 'staff',
    invited_by: auth.ctx.userId,
    token,
    expires_at: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString(),
  })
  if (error) {
    console.error('inviteStaff insert failed', { code: error.code, message: error.message })
    return { ok: false, message: 'Could not create the invitation. Please try again.' }
  }

  const { inviteUrl, emailSent } = await sendInvite({
    email,
    token,
    orgId: auth.ctx.orgId,
    inviterId: auth.ctx.userId,
  })
  revalidatePath('/dashboard/org/staff')
  return { ok: true, inviteUrl, emailSent }
}

/** New token + fresh 7 days for an invite that has not been accepted. Owner only. */
export async function resendStaffInvite(inviteId: string): Promise<InviteActionResult> {
  const auth = await requireOrgAction(['org_admin'])
  if (!auth.ok) return auth
  if (!z.string().uuid().safeParse(inviteId).success) return { ok: false, message: 'Invalid invitation.' }

  const admin = getSupabaseAdmin()
  const token = await mintToken()
  if (!token) return { ok: false, message: 'Could not refresh the invitation. Please try again.' }

  const { data, error } = await admin
    .from('staff_invites')
    .update({ token, expires_at: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString() })
    .eq('id', inviteId)
    .eq('org_id', auth.ctx.orgId)
    .is('accepted_at', null) // an accepted invite must never become usable again
    .select('email')
  if (error) {
    console.error('resendStaffInvite failed', { code: error.code, message: error.message })
    return { ok: false, message: 'Could not refresh the invitation. Please try again.' }
  }
  const row = data?.[0]
  if (!row) return { ok: false, message: 'That invitation was not found or was already accepted.' }

  const { inviteUrl, emailSent } = await sendInvite({
    email: row.email,
    token,
    orgId: auth.ctx.orgId,
    inviterId: auth.ctx.userId,
  })
  revalidatePath('/dashboard/org/staff')
  return { ok: true, inviteUrl, emailSent }
}

/** Revoke a pending invitation. Owner only. */
export async function revokeStaffInvite(inviteId: string): Promise<StaffResult> {
  const auth = await requireOrgAction(['org_admin'])
  if (!auth.ok) return auth
  if (!z.string().uuid().safeParse(inviteId).success) return { ok: false, message: 'Invalid invitation.' }

  const { data, error } = await getSupabaseAdmin()
    .from('staff_invites')
    .delete()
    .eq('id', inviteId)
    .eq('org_id', auth.ctx.orgId)
    .is('accepted_at', null)
    .select('id')
  if (error) {
    console.error('revokeStaffInvite failed', { code: error.code, message: error.message })
    return { ok: false, message: 'Could not revoke the invitation. Please try again.' }
  }
  if (!data?.length) return { ok: false, message: 'That invitation was not found or was already accepted.' }

  revalidatePath('/dashboard/org/staff')
  return { ok: true }
}

/**
 * Remove a staff member, effective immediately. Deleting their login also deletes
 * their profile (cascade), so every server check and RLS policy stops recognising
 * them at once, even while an old session token is still unexpired. Only `staff`
 * of the owner's own club can be removed: never an owner, never oneself.
 */
export async function removeStaffMember(profileId: string): Promise<StaffResult> {
  const auth = await requireOrgAction(['org_admin'])
  if (!auth.ok) return auth
  if (!z.string().uuid().safeParse(profileId).success) return { ok: false, message: 'Invalid team member.' }
  if (profileId === auth.ctx.userId) return { ok: false, message: 'You cannot remove yourself.' }

  const admin = getSupabaseAdmin()
  const { data: member } = await admin
    .from('profiles')
    .select('id, role, org_id')
    .eq('id', profileId)
    .maybeSingle()
  if (!member || member.org_id !== auth.ctx.orgId || member.role !== 'staff') {
    return { ok: false, message: 'That team member was not found.' }
  }

  const { error } = await admin.auth.admin.deleteUser(profileId)
  if (error) {
    console.error('removeStaffMember failed', { message: error.message })
    return { ok: false, message: 'Could not remove that team member. Please try again.' }
  }

  revalidatePath('/dashboard/org/staff')
  return { ok: true }
}

/* ------------------------- public: the invitee's side ------------------------- */

export type InvitePreview =
  | { ok: true; email: string; clubName: string }
  | { ok: false; message: string }

async function loadUsableInvite(token: string) {
  if (!TOKEN.test(token)) return null
  const { data: invite } = await getSupabaseAdmin()
    .from('staff_invites')
    .select('id, org_id, email, role, expires_at, accepted_at')
    .eq('token', token)
    .maybeSingle()
  return invite ?? null
}

const INVALID = 'This invitation link is not valid.'

/** What the invitation page shows before the invitee picks a password. */
export async function previewStaffInvite(token: string): Promise<InvitePreview> {
  const limited = await actionRateLimit('auth')
  if (limited) return { ok: false, message: limited }

  const invite = await loadUsableInvite(token)
  if (!invite) return { ok: false, message: INVALID }
  if (invite.accepted_at) return { ok: false, message: 'This invitation has already been used.' }
  if (Date.parse(invite.expires_at) < Date.now()) {
    return { ok: false, message: 'This invitation has expired. Ask the club owner to send a new one.' }
  }
  const { data: org } = await getSupabaseAdmin()
    .from('organizations')
    .select('name, status')
    .eq('id', invite.org_id)
    .maybeSingle()
  if (org?.status !== 'approved') return { ok: false, message: 'This club is not active right now.' }
  return { ok: true, email: invite.email, clubName: org.name }
}

const acceptSchema = z.object({
  token: z.string().regex(TOKEN),
  displayName: z.string().trim().min(2, 'Please enter your name').max(100),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
})

/**
 * Accept an invitation by creating the invitee's account. The emailed token is the
 * proof they own the address, so the account is created already confirmed, with
 * the role `staff` in the inviting club. The invitation is claimed atomically
 * first (`accepted_at IS NULL`), so one link can never create two accounts.
 */
export async function acceptStaffInvite(input: {
  token: string
  displayName: string
  password: string
}): Promise<{ ok: true; email: string } | { ok: false; message: string }> {
  const parsed = acceptSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? INVALID }
  const { token, displayName, password } = parsed.data

  const preview = await previewStaffInvite(token)
  if (!preview.ok) return preview

  const admin = getSupabaseAdmin()
  const { data: claimed } = await admin
    .from('staff_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('token', token)
    .is('accepted_at', null)
    .select('id, org_id, email')
  const invite = claimed?.[0]
  if (!invite) return { ok: false, message: 'This invitation has already been used.' }

  const release = () => admin.from('staff_invites').update({ accepted_at: null }).eq('id', invite.id)

  const created = await admin.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  })
  if (created.error || !created.data.user) {
    await release()
    const exists = /already|registered|exists/i.test(created.error?.message ?? '')
    return {
      ok: false,
      message: exists
        ? 'An account with this email already exists. Ask the club owner to invite a different address.'
        : 'Could not create your account. Please try again.',
    }
  }

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.data.user.id,
    org_id: invite.org_id,
    role: 'staff',
    display_name: displayName,
  })
  if (profileError) {
    console.error('acceptStaffInvite profile failed', { code: profileError.code, message: profileError.message })
    await admin.auth.admin.deleteUser(created.data.user.id)
    await release()
    return { ok: false, message: 'Could not finish setting up your account. Please try again.' }
  }

  revalidatePath('/dashboard/org/staff')
  return { ok: true, email: invite.email }
}

/* --------------- the invitee's side when the link came from Supabase Auth ------------------ */

const completeSchema = z.object({
  displayName: z.string().trim().min(2, 'Please enter your name').max(100),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
})

/**
 * Finish an invitation whose link came from Supabase Auth (`/auth/callback?type=invite` signed the
 * invitee in, but their account has no password, name or club yet). The caller is the verified session
 * user. The club comes ONLY from the pending `staff_invites` row for that user's email (the owner's own
 * record): claim it atomically, set the password and name, create the `staff` profile (a trigger
 * records the membership in `organization_members`). An account that already belongs to a club is
 * refused: nobody is silently moved between clubs.
 */
export async function completeInvitationAction(input: {
  displayName: string
  password: string
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = completeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Please check your details.' }

  const {
    data: { user },
  } = await (await createClient()).auth.getUser()
  if (!user?.email) return { ok: false, message: 'Your invitation link has expired. Please open it again from your email.' }

  const limited = await actionRateLimit('auth', user.id)
  if (limited) return { ok: false, message: limited }

  const admin = getSupabaseAdmin()
  const { data: existing } = await admin.from('profiles').select('id').eq('id', user.id).maybeSingle()
  if (existing) return { ok: false, message: 'This account already belongs to a club. Ask the club owner to invite a different address.' }

  const pending = await findPendingInviteForEmail(user.email)
  if (!pending) return { ok: false, message: 'There is no open invitation for this email address. Ask the club owner to send a new one.' }

  const { data: claimed } = await admin
    .from('staff_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', pending.id)
    .is('accepted_at', null)
    .select('id')
  if (!claimed?.length) return { ok: false, message: 'This invitation has already been used.' }
  const release = () => admin.from('staff_invites').update({ accepted_at: null }).eq('id', pending.id)

  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { display_name: parsed.data.displayName },
  })
  if (updateError) {
    await release()
    const weak = (updateError as { code?: string }).code === 'weak_password'
    return { ok: false, message: weak ? 'That password is too weak or has appeared in a data breach. Please choose another.' : 'Could not set your password. Please try again.' }
  }

  const { error: profileError } = await admin.from('profiles').insert({
    id: user.id,
    org_id: pending.orgId,
    role: 'staff',
    display_name: parsed.data.displayName,
  })
  if (profileError) {
    console.error('completeInvitation profile failed', { code: profileError.code, message: profileError.message })
    await release()
    return { ok: false, message: 'Could not finish setting up your account. Please try again.' }
  }

  revalidatePath('/dashboard/org/staff')
  return { ok: true }
}
