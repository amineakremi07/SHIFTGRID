'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import { revalidatePath } from 'next/cache'
import { inviteStaffSchema } from '@/lib/validations/api'
import { sendStaffInviteEmail } from '@/lib/email/resend'

/**
 * Server actions for staff invite management
 * Callers: Client components (StaffInviteForm, StaffInviteList, AcceptInvitePage)
 * Affected API: POST /api/staff/invites (via Server Actions), GET /api/staff/invites
 * Data schemas: inviteStaffSchema (email, role, organization_id), StaffInvite interface
 * User instruction: Build Staff Invite System - create, list, resend, cancel, accept invites
 */
export interface StaffInvite {
  id: string
  org_id: string
  email: string
  role: 'org_admin' | 'staff'
  invited_by: string
  token: string
  expires_at: string
  accepted_at: string | null
  created_at: string
  inviter_name?: string
}

export interface InviteResult {
  success: boolean
  invite?: StaffInvite
  error?: string
}

export interface ListInvitesResult {
  success: boolean
  invites?: StaffInvite[]
  error?: string
}

/**
 * Create a new staff invitation
 */
export async function createStaffInvite(input: {
  email: string
  role: 'org_admin' | 'staff'
  organization_id: string
}): Promise<InviteResult> {
  // Validate input
  const validation = inviteStaffSchema.safeParse(input)
  if (!validation.success) {
    return { success: false, error: validation.error.errors[0].message }
  }

  const { email, role, organization_id } = validation.data

  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }

  // Check if user is org_admin for this organization
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'org_admin' || profile.org_id !== organization_id) {
    return { success: false, error: 'Access denied. Organization admin access required.' }
  }

  // Check if email is already invited or is a member
  const { data: existingInvite } = await supabase
    .from('staff_invites')
    .select('id, status')
    .eq('org_id', organization_id)
    .eq('email', email)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (existingInvite) {
    return { success: false, error: 'This email already has a pending invitation' }
  }

  // Check if user is already a member
  const { data: existingMember } = await supabase
    .from('profiles')
    .select('id')
    .eq('org_id', organization_id)
    .eq('email', email)
    .single()

  if (existingMember) {
    return { success: false, error: 'This email is already a member of your organization' }
  }

  // Generate secure token
  const { data: token } = await getSupabaseAdmin()
    .rpc('generate_invite_token')

  if (!token) {
    return { success: false, error: 'Failed to generate invite token' }
  }

  // Create invite (expires in 7 days)
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  const { data: invite, error } = await getSupabaseAdmin()
    .from('staff_invites')
    .insert({
      org_id: organization_id,
      email,
      role,
      invited_by: user.id,
      token,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating staff invite:', error)
    return { success: false, error: error.message }
  }

  // TODO: Send invitation email (integrate with Resend)
  // await sendInviteEmail(email, token, organization_id)

  // Get organization name and inviter name for email
  const { data: org } = await getSupabaseAdmin()
    .from('organizations')
    .select('name')
    .eq('id', organization_id)
    .single()

  const { data: inviterProfile } = await getSupabaseAdmin()
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single()

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${token}`

  // Send invitation email
  await sendStaffInviteEmail({
    email,
    token,
    organizationName: org?.name || 'ShiftGrid',
    role,
    invitedByName: inviterProfile?.display_name || 'A team member',
    inviteUrl,
  })

  revalidatePath('/dashboard/staff')
  return { success: true, invite: invite as StaffInvite }
}

/**
 * List all staff invites for an organization
 */
export async function listStaffInvites(organization_id: string): Promise<ListInvitesResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }

  // Check if user is org_admin or staff for this organization
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .single()

  if (!profile || !['org_admin', 'staff'].includes(profile.role) || profile.org_id !== organization_id) {
    return { success: false, error: 'Access denied' }
  }

  const { data: invites, error } = await supabase
    .from('staff_invites')
    .select(`
      *,
      profiles!staff_invites_invited_by_fkey(display_name)
    `)
    .eq('org_id', organization_id)
    .order('created_at', { ascending: false })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, invites: (invites || []).map(invite => ({
    ...invite,
    inviter_name: (invite as any).profiles?.display_name
  })) as StaffInvite[] }
}

/**
 * Resend a staff invitation (generates new token, extends expiry)
 */
export async function resendStaffInvite(inviteId: string): Promise<InviteResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }

  // Get the invite to verify ownership
  const { data: invite, error: fetchError } = await supabase
    .from('staff_invites')
    .select('*')
    .eq('id', inviteId)
    .single()

  if (fetchError || !invite) {
    return { success: false, error: 'Invite not found' }
  }

  // Verify user is org_admin for this organization
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'org_admin' || profile.org_id !== invite.org_id) {
    return { success: false, error: 'Access denied' }
  }

  // Generate new token
  const { data: token } = await getSupabaseAdmin()
    .rpc('generate_invite_token')

  if (!token) {
    return { success: false, error: 'Failed to generate invite token' }
  }

  // Update invite with new token and extended expiry (7 more days)
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  const { data: updatedInvite, error } = await getSupabaseAdmin()
    .from('staff_invites')
    .update({
      token,
      expires_at: expiresAt.toISOString(),
      accepted_at: null,
    })
    .eq('id', inviteId)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  // Get organization name and inviter name for email
  const { data: org } = await getSupabaseAdmin()
    .from('organizations')
    .select('name')
    .eq('id', invite.org_id)
    .single()

  const { data: inviterProfile } = await getSupabaseAdmin()
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single()

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${token}`

  // Send invitation email
  await sendStaffInviteEmail({
    email: invite.email,
    token,
    organizationName: org?.name || 'ShiftGrid',
    role: invite.role,
    invitedByName: inviterProfile?.display_name || 'A team member',
    inviteUrl,
  })

  revalidatePath('/dashboard/staff')
  return { success: true, invite: updatedInvite as StaffInvite }
}

/**
 * Cancel a staff invitation
 */
export async function cancelStaffInvite(inviteId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }

  // Get the invite to verify ownership
  const { data: invite, error: fetchError } = await supabase
    .from('staff_invites')
    .select('*')
    .eq('id', inviteId)
    .single()

  if (fetchError || !invite) {
    return { success: false, error: 'Invite not found' }
  }

  // Verify user is org_admin for this organization
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'org_admin' || profile.org_id !== invite.org_id) {
    return { success: false, error: 'Access denied' }
  }

  // Delete the invite
  const { error } = await getSupabaseAdmin()
    .from('staff_invites')
    .delete()
    .eq('id', inviteId)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/staff')
  return { success: true }
}

/**
 * Validate and accept a staff invitation (public access via token)
 */
export async function acceptStaffInvite(token: string): Promise<{
  success: boolean
  invite?: StaffInvite
  error?: string
  requiresAuth?: boolean
}> {
  const supabaseAdmin = getSupabaseAdmin()

  // Find invite by token
  const { data: invite, error } = await supabaseAdmin
    .from('staff_invites')
    .select('*')
    .eq('token', token)
    .single()

  if (error || !invite) {
    return { success: false, error: 'Invalid or expired invitation' }
  }

  // Check if invite is expired
  if (new Date(invite.expires_at) < new Date()) {
    return { success: false, error: 'This invitation has expired' }
  }

  // Check if already accepted
  if (invite.accepted_at) {
    return { success: false, error: 'This invitation has already been accepted' }
  }

  // Check if user is already authenticated
  const { data: { user } } = await supabaseAdmin.auth.getUser()

  if (user) {
    // User is logged in - check if email matches
    if (user.email !== invite.email) {
      return { success: false, error: 'You are logged in with a different email. Please log out and use the invited email.' }
    }

    // Check if user already has a profile in this org
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single()

    if (existingProfile) {
      // Update existing profile with org and role
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({
          org_id: invite.org_id,
          role: invite.role,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

      if (updateError) {
        return { success: false, error: updateError.message }
      }
    } else {
      // Create new profile
      const { error: insertError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: user.id,
          org_id: invite.org_id,
          role: invite.role,
          display_name: user.user_metadata?.full_name || invite.email.split('@')[0],
          email: invite.email,
        })

      if (insertError) {
        return { success: false, error: insertError.message }
      }
    }

    // Mark invite as accepted
    await supabaseAdmin
      .from('staff_invites')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invite.id)

    return { success: true, invite: invite as StaffInvite }
  }

  // User not authenticated - they need to sign up
  return { success: true, invite: invite as StaffInvite, requiresAuth: true }
}