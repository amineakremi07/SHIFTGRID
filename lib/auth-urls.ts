/**
 * The Supabase Auth redirect URLs ShiftGrid depends on, in ONE place.
 *
 * Supabase only sends someone back to a URL on its allow-list (Authentication > URL Configuration >
 * Redirect URLs); anything else falls back to the Site URL, so an email link ends up on the wrong
 * site. The paths below are used by the code that asks Supabase for a redirect, and mirrored in
 * supabase/config.toml, .env.local.example and scripts/verify-auth-redirects.mjs (a unit test keeps
 * them identical). Rename a route here and the tests tell you what else to change.
 *
 *   /auth/callback       invitations, sign-up confirmation, magic links, e-mail change
 *   /accept-invitation   where a Supabase invitation lands to choose a name and password
 *   /reset-password      password recovery (what /forgot-password asks Supabase to send people to)
 *
 * NOT on the list: /accept-invite?token=... is our own emailed staff invitation. It never passes
 * through Supabase's redirect, so it needs no allow-list entry.
 */
export const AUTH_PATHS = {
  callback: '/auth/callback',
  acceptInvitation: '/accept-invitation',
  resetPassword: '/reset-password',
} as const

export const AUTH_REDIRECT_PATHS: readonly string[] = Object.values(AUTH_PATHS)

/** The origin `next dev` serves on. */
export const LOCAL_ORIGIN = 'http://localhost:3000'

/** Every URL the Supabase project must allow: the app's own origin, plus localhost for development. */
export function requiredAuthRedirectUrls(appUrl: string): string[] {
  const origins = new Set([appUrl.replace(/\/+$/, ''), LOCAL_ORIGIN])
  return [...origins].flatMap((origin) => AUTH_REDIRECT_PATHS.map((path) => `${origin}${path}`))
}
