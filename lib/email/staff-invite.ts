import { deliver } from '@/lib/notifications/mailer'
import { esc } from '@/lib/notifications/templates'

// Not a 'use server' module on purpose: that would expose sendStaffInviteEmail as a
// public endpoint able to send arbitrary invitations. Only staff-invites.ts calls it.

export interface StaffInviteEmailData {
  email: string
  token: string
  organizationName: string
  role: 'org_admin' | 'staff'
  invitedByName: string
  inviteUrl: string
}

export async function sendStaffInviteEmail(data: StaffInviteEmailData): Promise<{ success: boolean; error?: string }> {
  const roleLabel = data.role === 'org_admin' ? 'Organization Admin' : 'Staff Member'
  // Club and inviter names are typed by users: escape them before they reach the HTML.
  const org = esc(data.organizationName)
  const inviter = esc(data.invitedByName)
  const url = esc(data.inviteUrl)

  const result = await deliver({
    type: 'staff_invite',
    to: data.email,
    subject: `You've been invited to join ${data.organizationName} on ShiftGrid`,
    text: `${data.invitedByName} has invited you to join ${data.organizationName} as a ${roleLabel} on ShiftGrid.\n\nAccept the invitation: ${data.inviteUrl}\n\nIf you didn't expect this invitation, you can safely ignore this email.`,
    html: `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); border-radius: 12px 12px 0 0; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">ShiftGrid</h1>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; padding: 32px 24px;">
          <h2 style="color: #1e293b; margin: 0 0 16px; font-size: 20px;">You've been invited to join ${org}</h2>

          <p style="color: #475569; line-height: 1.6; margin: 0 0 24px;">
            Hi there, <strong>${inviter}</strong> has invited you to join <strong>${org}</strong> as a <strong>${roleLabel}</strong> on ShiftGrid — the platform for sports court booking in Tunisia.
          </p>

          <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <p style="color: #64748b; font-size: 14px; margin: 0 0 8px;">Your Role</p>
            <p style="color: #1e293b; font-size: 18px; font-weight: 600; margin: 0;">${roleLabel}</p>
          </div>

          <p style="color: #475569; line-height: 1.6; margin: 0 0 24px;">
            Click the button below to accept the invitation and create your account:
          </p>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${url}" style="display: inline-block; background: #3b82f6; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
              Accept Invitation
            </a>
          </div>

          <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 0;">
            This invitation expires in 7 days. If the button doesn't work, copy and paste this link into your browser:<br>
            <span style="word-break: break-all;">${url}</span>
          </p>

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">

          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            If you didn't expect this invitation, you can safely ignore this email.
          </p>
        </div>
      </div>
    `,
  })

  if (result.status !== 'sent') {
    console.error('Staff invite email not sent', { status: result.status, error: result.error })
    return { success: false, error: result.error ?? 'Email is not configured' }
  }
  return { success: true }
}
