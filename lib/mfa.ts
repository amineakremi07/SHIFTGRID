/**
 * Pure rules for the second factor (TOTP). No server imports, so they are unit-tested.
 *
 * Supabase marks a session `aal1` (password) or `aal2` (password + a verified TOTP code). A user is
 * ASKED for a code only when they have a VERIFIED factor: enrolling is optional, and an account with
 * none keeps working at aal1.
 *
 * Where the facts come from matters. `getAuthenticatorAssuranceLevel()` derives `nextLevel` from the
 * `user.factors` stored in the browser-held session cookie, which a client can edit; the user object
 * returned by `getUser()` comes from the auth server. So callers pass the server's user here, and the
 * current level from the (signed) access-token claim.
 */

export type AssuranceLevel = 'aal1' | 'aal2'

type FactorLike = { status?: string | null }

/** The account has at least one confirmed authenticator. */
export const hasVerifiedFactor = (factors: ReadonlyArray<FactorLike> | null | undefined): boolean =>
  Boolean(factors?.some((f) => f.status === 'verified'))

/** The session must step up: a verified factor exists but this session has not used it. */
export const needsSecondFactor = (factors: ReadonlyArray<FactorLike> | null | undefined, currentLevel: string | null | undefined): boolean =>
  hasVerifiedFactor(factors) && currentLevel !== 'aal2'

/** The page that asks for the code, remembering where the visitor was going. */
export const MFA_VERIFY_PATH = '/auth/mfa-verify'
export const mfaVerifyUrlPath = (returnTo: string): string => `${MFA_VERIFY_PATH}?redirect=${encodeURIComponent(returnTo)}`

/** A TOTP code is exactly six digits (spaces typed by the user are ignored). */
export const normaliseTotp = (raw: string): string | null => {
  const code = raw.replace(/\s+/g, '')
  return /^\d{6}$/.test(code) ? code : null
}
