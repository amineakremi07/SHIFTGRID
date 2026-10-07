import { AUTH_PATHS } from '@/lib/auth-urls'
import { safeRedirectPath } from '@/lib/safe-redirect'

/**
 * What `/auth/callback` does with the link a Supabase Auth email (invite, sign-up confirmation,
 * magic link, e-mail change, password recovery) sends the browser back with. Pure: no server
 * imports, so the decision is unit-tested.
 *
 * Supabase delivers a link in one of two shapes:
 *   ?code=<pkce code>                      exchanged for a session (needs the PKCE verifier cookie
 *                                          of the browser that started the flow)
 *   ?token_hash=<hash>&type=<otp type>     verified with verifyOtp (works on any device)
 * and reports a failed or expired link as ?error= / ?error_code= / ?error_description= (the query
 * or the #fragment: only the query reaches the server).
 */

export const OTP_TYPES = ['invite', 'signup', 'magiclink', 'recovery', 'email', 'email_change'] as const
export type OtpType = (typeof OTP_TYPES)[number]

export type CallbackDecision =
  | { kind: 'error' }
  /** A password recovery is finished by /reset-password itself (it verifies the token in the browser). */
  | { kind: 'forward-recovery'; path: string }
  | { kind: 'verify'; tokenHash: string; type: Exclude<OtpType, 'recovery'>; next: string | null }
  | { kind: 'exchange'; code: string; next: string | null }
  | { kind: 'nothing' }

const isOtpType = (value: string | null): value is OtpType => (OTP_TYPES as readonly string[]).includes(value ?? '')

export function decideCallback(params: URLSearchParams): CallbackDecision {
  if (params.get('error') || params.get('error_code') || params.get('error_description')) return { kind: 'error' }

  const next = safeRedirectPath(params.get('next'))
  const tokenHash = params.get('token_hash')
  const type = params.get('type')

  if (tokenHash && isOtpType(type)) {
    if (!/^[A-Za-z0-9_-]{8,200}$/.test(tokenHash)) return { kind: 'error' }
    if (type === 'recovery') {
      return { kind: 'forward-recovery', path: `${AUTH_PATHS.resetPassword}?token_hash=${encodeURIComponent(tokenHash)}&type=recovery` }
    }
    return { kind: 'verify', tokenHash, type, next }
  }

  const code = params.get('code')
  if (code) {
    if (!/^[A-Za-z0-9_.-]{8,200}$/.test(code)) return { kind: 'error' }
    return { kind: 'exchange', code, next }
  }

  return { kind: 'nothing' }
}

/**
 * Where a verified link sends the visitor. An invitation goes to the page where they choose a name and
 * password; anything else follows a safe `next`, then the role's own landing page (`roleLanding`).
 * `PASSWORD_RECOVERY` (a recovery code that reached this route) continues on /reset-password.
 */
export function pathAfterVerify(args: { type?: OtpType; redirectType?: string | null; next: string | null; roleLanding: string }): string {
  if (args.redirectType === 'PASSWORD_RECOVERY') return `${AUTH_PATHS.resetPassword}?code=1`
  if (args.type === 'invite') return AUTH_PATHS.acceptInvitation
  return args.next ?? args.roleLanding
}

/** Where a failed link ends up: the sign-in page, which explains it. */
export const CALLBACK_ERROR_PATH = '/login?error=link_invalid'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A club id taken from a callback link: a uuid or null. Never trusted further than that (the club is re-checked). */
export const clubFromParam = (value: string | null): string | null => (value && UUID.test(value) ? value : null)

/** Name of the short-lived cookie that carries the club and return path through the Google round trip. */
export const OAUTH_COOKIE = 'sg-oauth'

/**
 * The club and return path saved before leaving for Google. They travel in a cookie, not in the redirect
 * URL, so the URL stays exactly the one on Supabase's Redirect URLs list. Both are re-validated here.
 */
export function parseOAuthCookie(raw: string | null | undefined): { club: string | null; next: string | null } {
  if (!raw) return { club: null, next: null }
  try {
    const value = JSON.parse(decodeURIComponent(raw)) as { club?: unknown; next?: unknown }
    return {
      club: clubFromParam(typeof value.club === 'string' ? value.club : null),
      next: safeRedirectPath(typeof value.next === 'string' ? value.next : null),
    }
  } catch {
    return { club: null, next: null }
  }
}
