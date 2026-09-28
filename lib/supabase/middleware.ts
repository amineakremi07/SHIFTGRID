import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/lib/types/database'

/**
 * Supabase client for the Proxy (formerly Middleware) layer.
 *
 * Next.js 16 renamed the `middleware` convention to `proxy` and pins it to the
 * Node.js runtime, so this runs per-request on the server. It returns both the
 * client and the mutable response so the caller can forward refreshed auth
 * cookies back to the browser.
 *
 * Callers: proxy.ts
 */
export function createProxyClient(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // `response` is reassigned inside setAll, so hand back a getter rather than
  // the value captured at construction time.
  return { supabase, getResponse: () => response }
}
