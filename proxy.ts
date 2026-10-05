import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { landingPathFor } from '@/lib/auth-landing'
import type { UserRole } from '@/lib/types/database'
import { createProxyClient } from '@/lib/supabase/middleware'
import { clientIpFrom, rateLimit, tooManyRequests, type RateRule } from '@/lib/rate-limit'
import { securityHeaderRecord } from '@/lib/security-headers'

/**
 * Next.js 16 Proxy (formerly `middleware.ts`).
 *
 * Responsibilities: rate limiting on /api/*, security headers, RBAC guards for
 * /dashboard/* and /admin/*, and role-derived session cookie lifetimes.
 *
 * Runtime note: Proxy always runs on the Node.js runtime in Next.js 16 and the
 * runtime is not configurable.
 */

// Security headers applied to every proxied response (single list in lib/security-headers.ts).
const securityHeaders = securityHeaderRecord()

// Session duration configuration (in seconds)
const SESSION_DURATION = {
  player: 30 * 24 * 60 * 60, // 30 days for players with rememberMe
  staff: 365 * 24 * 60 * 60, // 1 year (effectively persistent) for staff/owners
  default: 24 * 60 * 60, // 1 day default
}

const STAFF_ROLES = new Set(['org_admin', 'staff', 'platform_admin'])

function getClientIp(request: NextRequest): string {
  // `NextRequest.ip` was removed in Next.js 16 — derive from forwarding headers.
  return clientIpFrom(request.headers)
}

/** Which rule guards an /api path. */
function apiRule(pathname: string): RateRule {
  if (pathname.startsWith('/api/auth/')) return 'auth'
  if (pathname.startsWith('/api/cron/')) return 'cron'
  return 'api'
}

function withSecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  return response
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Rate limit API routes (Upstash when configured, in-memory otherwise).
  if (pathname.startsWith('/api/')) {
    const rule = apiRule(pathname)
    const result = await rateLimit(rule, `${getClientIp(request)}:${rule === 'api' ? pathname : rule}`, pathname)
    if (!result.ok) return tooManyRequests(result, securityHeaders)
  }

  const { supabase, getResponse } = createProxyClient(request)

  // Refreshes the session as a side effect; getUser() revalidates against the
  // auth server, unlike the deprecated getSession().
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let userRole: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    userRole = profile?.role ?? null
  }

  // Protected routes — require authentication.
  const protectedPaths = ['/dashboard', '/admin']
  if (protectedPaths.some((path) => pathname.startsWith(path)) && !user) {
    const redirectUrl = new URL('/login-owner', request.url)
    redirectUrl.searchParams.set('redirect', pathname)
    return withSecurityHeaders(NextResponse.redirect(redirectUrl))
  }

  // Admin-only routes.
  if (pathname.startsWith('/admin') && userRole !== 'platform_admin') {
    return withSecurityHeaders(NextResponse.redirect(new URL('/', request.url)))
  }

  // Redirect authenticated users away from auth pages.
  const authPaths = ['/login', '/login-owner', '/signup-owner']
  if (authPaths.includes(pathname) && user) {
    return withSecurityHeaders(NextResponse.redirect(new URL(landingPathFor(userRole as UserRole | null), request.url)))
  }

  const response = getResponse()

  // Extend Supabase auth cookie lifetime based on role.
  let sessionMaxAge = SESSION_DURATION.default
  if (userRole === 'player') sessionMaxAge = SESSION_DURATION.player
  else if (userRole && STAFF_ROLES.has(userRole)) sessionMaxAge = SESSION_DURATION.staff

  if (user && sessionMaxAge !== SESSION_DURATION.default) {
    const authCookies = request.cookies
      .getAll()
      .filter((c) => c.name.startsWith('sb-') || c.name === 'auth-token')

    authCookies.forEach((cookie) => {
      response.cookies.set({
        name: cookie.name,
        value: cookie.value,
        maxAge: sessionMaxAge,
        path: '/',
        // NOT httpOnly: @supabase/ssr's browser client reads these from
        // document.cookie. Marking them httpOnly hides the session from the
        // client and breaks client-side auth state and Realtime subscriptions.
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      })
    })
  }

  return withSecurityHeaders(response)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - manifest.json (PWA manifest: must stay public and skip the auth round trips)
     * - public image assets
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
