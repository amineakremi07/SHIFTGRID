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
    ? `${input.clubName} est approuvé sur ShiftGrid`
    : `Votre inscription ShiftGrid pour ${input.clubName} nécessite des modifications`
  const html = approved
    ? `<p>Bonjour ${name},</p>
       <p>Bonne nouvelle : <strong>${club}</strong> a été vérifié et est désormais <strong>en ligne sur ShiftGrid</strong>. Les joueurs peuvent le trouver et réserver vos terrains.</p>
       <p><a href="${app}/login-owner">Connectez-vous à votre tableau de bord</a> pour ajouter vos terrains, définir vos horaires d'ouverture et commencer à recevoir des réservations.</p>`
    : `<p>Bonjour ${name},</p>
       <p>Nous avons examiné l'inscription de <strong>${club}</strong> et n'avons pas encore pu l'approuver.</p>
       <p><strong>Motif :</strong> ${escapeHtml(input.reason ?? 'Non précisé')}</p>
       <p>Merci de contacter <a href="mailto:support@shiftgrid.tn">support@shiftgrid.tn</a> avec les documents corrigés et nous l'examinerons à nouveau.</p>`

  const result = await deliver({ to: input.to, type: 'org_decision', subject, html })
  if (result.status !== 'sent') {
    console.error('Decision email not sent', { status: result.status, error: result.error })
    return { sent: false }
  }
  return { sent: true }
}
