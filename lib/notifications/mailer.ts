import { Resend } from 'resend'

/**
 * The only place that talks to the email provider.
 *
 * `deliver()` never throws and never hangs: the caller records the outcome and the
 * user's action goes on regardless. No RESEND_API_KEY (or EMAIL_DRY_RUN=1) means
 * "skipped", not an error, so development works without an account.
 *
 *   RESEND_API_KEY   the provider key
 *   EMAIL_FROM       "ShiftGrid <noreply@your-verified-domain>" (the sending domain
 *                    must be verified in Resend, or every send is rejected)
 *   EMAIL_DRY_RUN=1  render and record, but do not send
 *   EMAIL_DRY_RUN_DELAY_MS  (testing) make a dry run take this long, to prove a slow
 *                    provider does not slow the user's request
 */

export type DeliverResult = { status: 'sent' | 'skipped' | 'failed'; id?: string; error?: string }

const SEND_TIMEOUT_MS = 10_000
const DEFAULT_FROM = 'ShiftGrid <noreply@shiftgrid.tn>'

export function emailEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.RESEND_API_KEY) && env.EMAIL_DRY_RUN !== '1'
}

export async function deliver(message: { to: string; subject: string; html: string; text: string }): Promise<DeliverResult> {
  if (!emailEnabled()) {
    const delay = Number(process.env.EMAIL_DRY_RUN_DELAY_MS ?? 0)
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 30_000)))
    return { status: 'skipped', error: process.env.RESEND_API_KEY ? 'dry run' : 'RESEND_API_KEY is not set' }
  }

  try {
    // Built per call, not at import, so a missing key cannot break unrelated pages.
    const resend = new Resend(process.env.RESEND_API_KEY)
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('email provider timed out')), SEND_TIMEOUT_MS))
    const { data, error } = await Promise.race([
      resend.emails.send({
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      timeout,
    ])
    if (error) return { status: 'failed', error: `${error.name ?? 'error'}: ${error.message}`.slice(0, 500) }
    return { status: 'sent', id: data?.id }
  } catch (e) {
    return { status: 'failed', error: (e instanceof Error ? e.message : String(e)).slice(0, 500) }
  }
}
