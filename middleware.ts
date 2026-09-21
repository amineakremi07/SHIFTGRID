import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Rate limiting store (in-memory for development, use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

// Security headers
const securityHeaders = {
  'X-DNS-Prefetch-Control': 'on',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

// Rate limiting configuration
const RATE_LIMIT = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60, // 60 requests per minute
}

// Session duration configuration (in seconds)
const SESSION_DURATION = {
  player: 30 * 24 * 60 * 60, // 30 days for players with rememberMe
  staff: 365 * 24 * 60 * 60, // 1 year (effectively persistent) for staff/owners
  default: 24 * 60 * 60, // 1 day default
}

function getRateLimitKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0] : request.ip || 'unknown'
  return `${ip}:${request.nextUrl.pathname}`
}

function checkRateLimit(key: string): boolean {
  const now = Date.now()
  const record = rateLimitStore.get(key)

  if (!record || now > record.resetTime) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + RATE_LIMIT.windowMs,
    })
    return true
  }

  if (record.count >= RATE_LIMIT.maxRequests) {
    return false
  }

  record.count++
  return true
}

// Clean up expired rate limit records periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}, 60 * 1000) // Clean every minute

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Apply rate limiting to API routes
  if (pathname.startsWith('/api/')) {
    const rateLimitKey = getRateLimitKey(request)
    if (!checkRateLimit(rateLimitKey)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': '60',
            ...securityHeaders,
          }
        }
      )
    }
  }

  // Create Supabase client
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session if it exists
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Get user profile to determine session duration
  let userRole: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    userRole = profile?.role ?? null
  }

  // Determine session maxAge based on role
  let sessionMaxAge = SESSION_DURATION.default
  if (userRole === 'player') {
    sessionMaxAge = SESSION_DURATION.player
  } else if (userRole === 'org_admin' || userRole === 'staff' || userRole === 'platform_admin') {
    sessionMaxAge = SESSION_DURATION.staff
  }

  // Protected routes - require authentication
  const protectedPaths = ['/dashboard', '/admin']
  const isProtectedPath = protectedPaths.some(path => pathname.startsWith(path))

  if (isProtectedPath && !user) {
    const redirectUrl = new URL('/login-owner', request.url)
    redirectUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Admin-only routes
  if (pathname.startsWith('/admin')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login-owner', request.url))
    }

    if (userRole !== 'platform_admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  // Redirect authenticated users away from auth pages
  const authPaths = ['/login-owner', '/signup-owner']
  if (authPaths.includes(pathname) && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Apply session cookie maxAge if user is authenticated
  // This modifies the Supabase auth cookies to have the correct expiry
  if (user && sessionMaxAge !== SESSION_DURATION.default) {
    const authCookies = request.cookies.getAll().filter(c => c.name.startsWith('sb-') || c.name === 'auth-token')
    authCookies.forEach(cookie => {
      response.cookies.set({
        name: cookie.name,
        value: cookie.value,
        maxAge: sessionMaxAge,
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      })
    })
  }

  // Apply security headers to all responses
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value)
  })

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
