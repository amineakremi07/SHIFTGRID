import { NextResponse, type NextRequest } from 'next/server'

import { CALLBACK_ERROR_PATH, decideCallback, OAUTH_COOKIE, parseOAuthCookie, pathAfterVerify } from '@/lib/auth-callback'
import { landingPathFor } from '@/lib/auth-landing'
import { assessGoogleSignIn, createGooglePlayerProfile, isGoogleUser, neutraliseUnprovenPassword } from '@/lib/google-signup'
import { reportServerError } from '@/lib/observability'
import { captureAudit, captureServerEvent } from '@/lib/telemetry'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/lib/types/database'

/**
 * GET /auth/callback: where the links in Supabase Auth emails land (invitation, sign-up confirmation,
 * magic link, e-mail change). It reads `token_hash` + `type` (verifyOtp) or `code` (PKCE exchange),
 * establishes the session in cookies, and redirects: an invitation to /accept-invitation, anything else
 * to a safe `?next=` or the role's landing page. A password recovery is handed to /reset-password.
 * A bad, expired or already used link goes to /login?error=link_invalid, never to a 404.
 *
 * Supabase dashboard > Authentication > URL Configuration must list this URL under Redirect URLs.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // The Google round trip leaves its club / return path in a short-lived cookie; it is used once.
  const oauth = parseOAuthCookie(request.cookies.get(OAUTH_COOKIE)?.value)
  const go = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.url))
    if (request.cookies.has(OAUTH_COOKIE)) response.cookies.set(OAUTH_COOKIE, '', { path: '/auth', maxAge: 0 })
    return response
  }

  try {
    const decision = decideCallback(request.nextUrl.searchParams)
    if (decision.kind === 'error') return go(CALLBACK_ERROR_PATH)
    if (decision.kind === 'forward-recovery') return go(decision.path)
    if (decision.kind === 'nothing') return go('/login')

    const supabase = await createClient()
    let type: Parameters<typeof pathAfterVerify>[0]['type']
    let redirectType: string | null | undefined

    if (decision.kind === 'verify') {
      const { error } = await supabase.auth.verifyOtp({ token_hash: decision.tokenHash, type: decision.type })
      if (error) return go(CALLBACK_ERROR_PATH)
      type = decision.type
    } else {
      const { data, error } = await supabase.auth.exchangeCodeForSession(decision.code)
      if (error) return go(CALLBACK_ERROR_PATH)
      redirectType = (data as { redirectType?: string | null }).redirectType
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return go(CALLBACK_ERROR_PATH)

    // The role decides the landing page (an account with no profile yet simply goes home).
    const { data: existing } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    let profile = existing

    // "Continue with Google": an existing account just signs in; a new one needs a club to belong to.
    if (isGoogleUser(user)) {
      // Never link or trust a Google identity blindly: it must come with a verified address, and an
      // unconfirmed password someone else set on that address is invalidated (see assessGoogleSignIn).
      const verdict = assessGoogleSignIn(user)
      if (verdict === 'refuse') {
        await supabase.auth.signOut()
        return go('/login?error=google_unverified')
      }
      if (verdict === 'reset-password') {
        await neutraliseUnprovenPassword(user.id)
        await supabase.auth.signOut({ scope: 'others' })
        captureAudit({ action: 'oauth.unproven_password_reset', status: 'reset' })
      }
      let signedUp = false
      if (!profile) {
        const club = oauth.club
        if (!club || !(await createGooglePlayerProfile(user, club))) {
          await supabase.auth.signOut()
          return go('/login?error=google_no_club')
        }
        profile = { role: 'player' }
        signedUp = true
      }
      // Counts only: no email, name or id.
      captureServerEvent(signedUp ? 'user_signup_google_success' : 'user_login_google_success', { role: profile.role })
    }

    const roleLanding = profile ? landingPathFor(profile.role as UserRole) : '/'

    return go(pathAfterVerify({ type, redirectType, next: decision.next ?? oauth.next, roleLanding }))
  } catch (error) {
    console.error('auth callback failed', error instanceof Error ? error.message : error)
    reportServerError('auth.callback', error)
    return go(CALLBACK_ERROR_PATH)
  }
}
