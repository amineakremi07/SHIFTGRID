import nodemailer from 'nodemailer'

/**
 * The only place that talks to the email provider (any SMTP server: Gmail, Mailtrap,
 * Brevo, SES SMTP, ...). Every email in the app goes through `deliver()`.
 *
 * `deliver()` never throws and never hangs: the caller records the outcome and the
 * user's action goes on regardless. No SMTP_HOST (or EMAIL_DRY_RUN=1) means
 * "skipped", not an error, so development works without an account.
 *
 *   SMTP_HOST        e.g. smtp.gmail.com, sandbox.smtp.mailtrap.io
 *   SMTP_PORT        587 (STARTTLS, default) or 465 (implicit TLS)
 *   SMTP_USER        login; leave unset for a server without authentication
 *   SMTP_PASS        password / app password
 *   EMAIL_FROM       "ShiftGrid <noreply@your-domain>" (the provider must be allowed to
 *                    send for this domain, SPF/DKIM, or mail is rejected or spam-foldered)
 *   EMAIL_DRY_RUN=1  render and record, but do not send
 *   EMAIL_DRY_RUN_DELAY_MS  (testing) make a dry run take this long, to prove a slow
 *                    provider does not slow the user's request
 */

export type DeliverResult = { status: 'sent' | 'skipped' | 'failed'; id?: string; error?: string }

const SEND_TIMEOUT_MS = 10_000
const DEFAULT_FROM = 'ShiftGrid <noreply@shiftgrid.tn>'

export function emailEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.SMTP_HOST) && env.EMAIL_DRY_RUN !== '1'
}

// Built per call, not at import, so missing SMTP settings cannot break unrelated pages.
function createTransporter() {
  const port = Number(process.env.SMTP_PORT) || 587
  const user = process.env.SMTP_USER
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: user ? { user, pass: process.env.SMTP_PASS ?? '' } : undefined,
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS,
  })
}

export async function deliver(message: { to: string; subject: string; html: string; text?: string }): Promise<DeliverResult> {
  if (!emailEnabled()) {
    const delay = Number(process.env.EMAIL_DRY_RUN_DELAY_MS ?? 0)
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 30_000)))
    return { status: 'skipped', error: process.env.SMTP_HOST ? 'dry run' : 'SMTP_HOST is not set' }
  }

  const transporter = createTransporter()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('email provider timed out')), SEND_TIMEOUT_MS)
    })
    const info = await Promise.race([
      transporter.sendMail({
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      timeout,
    ])
    // SMTP can accept a message for some recipients and refuse it for others.
    if (info.rejected.length > 0 && info.accepted.length === 0) {
      return { status: 'failed', error: `rejected by the SMTP server: ${info.response ?? 'no response'}`.slice(0, 500) }
    }
    return { status: 'sent', id: info.messageId }
  } catch (e) {
    return { status: 'failed', error: (e instanceof Error ? e.message : String(e)).slice(0, 500) }
  } finally {
    clearTimeout(timer)
    transporter.close()
  }
}
