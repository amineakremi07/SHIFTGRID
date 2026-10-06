import nodemailer from 'nodemailer'

import { captureServerEvent } from '@/lib/telemetry'

/**
 * The only place that talks to the email provider. Every email in the app goes through `deliver()`.
 * The provider is Brevo (SMTP relay, STARTTLS on 587); any other SMTP server works by setting
 * SMTP_HOST (Gmail, Mailtrap, SES SMTP, ...).
 *
 * `deliver()` never throws and never hangs: the caller records the outcome and the user's action goes
 * on regardless. A failure (bad credentials, network glitch, provider timeout) is returned as
 * `failed`, logged (console.warn, never Sentry) and counted in PostHog; it never reaches the user.
 * Without credentials (no SMTP_USER and no SMTP_HOST) or with EMAIL_DRY_RUN=1 the result is `skipped`,
 * not an error, so development works without an account.
 *
 *   SMTP_USER        Brevo SMTP login (Brevo > SMTP & API > SMTP). Setting it turns sending on.
 *   SMTP_PASS        Brevo SMTP key (not your account password)
 *   SMTP_HOST        default smtp-relay.brevo.com
 *   SMTP_PORT        587 (STARTTLS, default) or 465 (implicit TLS)
 *   SMTP_FROM        "ShiftGrid <noreply@your-domain>", a sender verified in Brevo (EMAIL_FROM still works)
 *   EMAIL_DRY_RUN=1  render and record, but do not send
 *   EMAIL_DRY_RUN_DELAY_MS  (testing) make a dry run take this long, to prove a slow
 *                    provider does not slow the user's request
 */

export type EmailAttachment = { filename: string; content: Buffer; cid: string; contentType: string }

export type DeliverResult = { status: 'sent' | 'skipped' | 'failed'; id?: string; error?: string }

const SEND_TIMEOUT_MS = 10_000
const DEFAULT_FROM = 'ShiftGrid <noreply@shiftgrid.tn>'

export const BREVO_SMTP_HOST = 'smtp-relay.brevo.com'

/** The SMTP server to use: SMTP_HOST, else Brevo once credentials exist, else none (sending is off). */
export function smtpHost(env: Record<string, string | undefined> = process.env): string | undefined {
  return env.SMTP_HOST || (env.SMTP_USER ? BREVO_SMTP_HOST : undefined)
}

export function emailEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(smtpHost(env)) && env.EMAIL_DRY_RUN !== '1'
}

/** The From header: SMTP_FROM, else EMAIL_FROM (older name), else the default sender. */
export function senderAddress(env: Record<string, string | undefined> = process.env): string {
  return env.SMTP_FROM || env.EMAIL_FROM || DEFAULT_FROM
}

// Built per call, not at import, so missing SMTP settings cannot break unrelated pages.
function createTransporter() {
  const port = Number(process.env.SMTP_PORT) || 587
  const user = process.env.SMTP_USER
  return nodemailer.createTransport({
    host: smtpHost(),
    port,
    // 587 = STARTTLS: the connection starts plain and is upgraded; `secure` is only for implicit TLS (465).
    secure: port === 465,
    // In production never fall back to an unencrypted session if the upgrade is refused.
    requireTLS: port !== 465 && process.env.NODE_ENV === 'production',
    auth: user ? { user, pass: process.env.SMTP_PASS ?? '' } : undefined,
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS,
  })
}

/** A plain-language cause for the usual SMTP failures, to make the log actionable. */
function smtpHint(e: unknown, code: string): string {
  const responseCode = (e as { responseCode?: unknown } | null)?.responseCode
  if (code === 'EAUTH' || responseCode === 535) return 'SMTP authentication failed: check SMTP_USER / SMTP_PASS (Brevo needs the SMTP key, not the account password)'
  if (code === 'EENVELOPE' || responseCode === 550 || responseCode === 553) return 'sender or recipient refused: the From address/domain must be verified with the provider (SMTP_FROM)'
  if (code === 'ETIMEDOUT' || code === 'ECONNECTION' || code === 'ESOCKET' || code === 'ECONNREFUSED') return 'cannot reach the SMTP server: check SMTP_HOST / SMTP_PORT and the network'
  return 'see message'
}

export async function deliver(message: { to: string; subject: string; html: string; text?: string; attachments?: EmailAttachment[] }): Promise<DeliverResult> {
  if (!emailEnabled()) {
    const delay = Number(process.env.EMAIL_DRY_RUN_DELAY_MS ?? 0)
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 30_000)))
    return { status: 'skipped', error: smtpHost() ? 'dry run' : 'SMTP_USER / SMTP_HOST is not set' }
  }

  const started = performance.now()
  let transporter: ReturnType<typeof createTransporter> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const finish = (result: DeliverResult, errorCode?: string): DeliverResult => {
    captureServerEvent('api_request_perf', {
      endpoint: 'email.deliver',
      duration_ms: Math.round(performance.now() - started),
      status: result.status === 'failed' ? `failed:${errorCode ?? 'unknown'}` : result.status,
    })
    return result
  }
  try {
    transporter = createTransporter()
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('email provider timed out')), SEND_TIMEOUT_MS)
    })
    const info = await Promise.race([
      transporter.sendMail({
        from: senderAddress(),
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        // Inline images (cid:) are the only QR delivery most mail clients render; data: URIs are blocked.
        attachments: message.attachments,
      }),
      timeout,
    ])
    // SMTP can accept a message for some recipients and refuse it for others.
    if (info.rejected.length > 0 && info.accepted.length === 0) {
      return finish({ status: 'failed', error: `rejected by the SMTP server: ${info.response ?? 'no response'}`.slice(0, 500) }, 'rejected')
    }
    return finish({ status: 'sent', id: info.messageId })
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code
    const errorCode = typeof code === 'string' ? code : e instanceof Error && e.message.includes('timed out') ? 'ETIMEDOUT' : 'unknown'
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 500)
    // Message only (no recipient or body); the outbox row also keeps it for the retry run.
    // A provider failure is an expected operational problem (bad key, unverified sender, outage), not an
    // application bug, so it is logged (console.warn) and counted in PostHog, never sent to Sentry.
    console.warn('email delivery failed', { code: errorCode, hint: smtpHint(e, errorCode), message: error })
    return finish({ status: 'failed', error }, errorCode)
  } finally {
    clearTimeout(timer)
    transporter?.close()
  }
}
