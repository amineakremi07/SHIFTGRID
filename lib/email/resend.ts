'use server'

import { Resend } from 'resend'


export interface StaffInviteEmailData {
  email: string
  token: string
  organizationName: string
  role: 'org_admin' | 'staff'
  invitedByName: string
  inviteUrl: string
}

export async function sendStaffInviteEmail(data: StaffInviteEmailData): Promise<{ success: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    console.error('Staff invite email skipped: RESEND_API_KEY is not set')
    return { success: false, error: 'Email is not configured' }
  }
  // Built per call, not at import, so a missing key cannot break unrelated pages.
  const resend = new Resend(process.env.RESEND_API_KEY)

  try {
    const roleLabel = data.role === 'org_admin' ? 'Organization Admin' : 'Staff Member'
    const result = await resend.emails.send({
      from: 'ShiftGrid <noreply@shiftgrid.tn>',
      to: data.email,
      subject: `You've been invited to join ${data.organizationName} on ShiftGrid`,
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); border-radius: 12px 12px 0 0; padding: 24px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">ShiftGrid</h1>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; padding: 32px 24px;">
            <h2 style="color: #1e293b; margin: 0 0 16px; font-size: 20px;">You've been invited to join ${data.organizationName}</h2>

            <p style="color: #475569; line-height: 1.6; margin: 0 0 24px;">
              Hi there, <strong>${data.invitedByName}</strong> has invited you to join <strong>${data.organizationName}</strong> as a <strong>${roleLabel}</strong> on ShiftGrid — the platform for sports court booking in Tunisia.
            </p>

            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
              <p style="color: #64748b; font-size: 14px; margin: 0 0 8px;">Your Role</p>
              <p style="color: #1e293b; font-size: 18px; font-weight: 600; margin: 0;">${roleLabel}</p>
            </div>

            <p style="color: #475569; line-height: 1.6; margin: 0 0 24px;">
              Click the button below to accept the invitation and create your account:
            </p>

            <div style="text-align: center; margin: 32px 0;">
              <a href="${data.inviteUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                Accept Invitation
              </a>
            </div>

            <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 0;">
              This invitation expires in 7 days. If the button doesn't work, copy and paste this link into your browser:<br>
              <span style="word-break: break-all;">${data.inviteUrl}</span>
            </p>

            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">

            <p style="color: #94a3b8; font-size: 12px; margin: 0;">
              If you didn't expect this invitation, you can safely ignore this email.
            </p>
          </div>
        </div>
      `,
    })

    if (result.error) {
      console.error('Resend error:', result.error)
      return { success: false, error: result.error.message }
    }

    return { success: true }
  } catch (error) {
    console.error('Failed to send staff invite email:', error)
    return { success: false, error: 'Failed to send email' }
  }
}