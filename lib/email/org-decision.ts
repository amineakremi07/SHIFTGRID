import { deliver } from '@/lib/notifications/mailer'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Tell a club owner the outcome of their verification. Never throws: a failed
 * email must not undo a decision that is already saved (deliver() never throws).
 */
export async function sendOrgDecisionEmail(input: {
  to: string
  ownerName: string
  clubName: string
  decision: 'approved' | 'rejected'
  reason?: string
}): Promise<{ sent: boolean }> {
  const app = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const name = escapeHtml(input.ownerName)
  const club = escapeHtml(input.clubName)

  const approved = input.decision === 'approved'
  const subject = approved
    ? `${input.clubName} is approved on ShiftGrid`
    : `Your ShiftGrid registration for ${input.clubName} needs changes`
  const html = approved
    ? `<p>Hi ${name},</p>
       <p>Good news: <strong>${club}</strong> has been verified and is now <strong>live on ShiftGrid</strong>. Players can find it and book your courts.</p>
       <p><a href="${app}/login-owner">Sign in to your dashboard</a> to add courts, set your opening hours and start taking bookings.</p>`
    : `<p>Hi ${name},</p>
       <p>We reviewed the registration for <strong>${club}</strong> and could not approve it yet.</p>
       <p><strong>Reason:</strong> ${escapeHtml(input.reason ?? 'Not specified')}</p>
       <p>Please contact <a href="mailto:support@shiftgrid.tn">support@shiftgrid.tn</a> with the corrected documents and we will review it again.</p>`

  const result = await deliver({ to: input.to, type: 'org_decision', subject, html })
  if (result.status !== 'sent') {
    console.error('Decision email not sent', { status: result.status, error: result.error })
    return { sent: false }
  }
  return { sent: true }
}
