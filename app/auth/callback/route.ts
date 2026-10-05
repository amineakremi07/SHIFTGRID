import { NextResponse, type NextRequest } from 'next/server'

import { CALLBACK_ERROR_PATH, decideCallback, pathAfterVerify } from '@/lib/auth-callback'
import { landingPathFor } from '@/lib/auth-landing'
import { reportServerError } from '@/lib/observability'
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
  const go = (path: string) => NextResponse.redirect(new URL(path, request.url))

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
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const roleLanding = profile ? landingPathFor(profile.role as UserRole) : '/'

    return go(pathAfterVerify({ type, redirectType, next: decision.next, roleLanding }))
  } catch (error) {
    console.error('auth callback failed', error instanceof Error ? error.message : error)
    reportServerError('auth.callback', error)
    return go(CALLBACK_ERROR_PATH)
  }
}
