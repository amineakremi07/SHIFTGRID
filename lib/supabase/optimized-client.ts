import { cache } from 'react'
import { createServerClient, createBrowserClient as createSsrBrowserClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/types/database'

/**
 * Request-scoped Supabase clients.
 * Callers: lib/actions/staff-invites.ts, lib/actions/player-auth.ts, lib/actions/admin-verification.ts
 */

/**
 * Get the Supabase server client for the current request.
 *
 * Memoised with React `cache()`, which is scoped to a single request. A
 * module-level singleton would be shared across every request served by a warm
 * server instance and would leak one user's authenticated client to another.
 */
export const getSupabaseServerClient = cache(async () => {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component; the proxy refreshes sessions.
          }
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  )
})

/**
 * Create a new Supabase client for API routes
 * Uses service role key for admin operations
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  )
}

export const getSupabaseAdmin = createAdminClient

/**
 * Create a client for browser usage
 * Use in Client Components only
 */
export function createBrowserClient() {
  return createSsrBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

/**
 * Get user session from server client
 */
export async function getServerSession() {
  // getUser() revalidates against the auth server; getSession() trusts the
  // cookie and is unsafe/deprecated in the SSR context.
  const supabase = await getSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ? { user } : null
}

/**
 * Get user from server client
 */
export async function getServerUser() {
  const supabase = await getSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/**
 * Get user profile with role and organization
 */
export async function getServerProfile() {
  const supabase = await getSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, org_id, display_name, avatar_url')
    .eq('id', user.id)
    .single()

  return profile
}

/**
 * Check if user has specific role
 */
export async function hasRole(roles: string | string[]): Promise<boolean> {
  const profile = await getServerProfile()
  if (!profile) return false

  const roleArray = Array.isArray(roles) ? roles : [roles]
  return roleArray.includes(profile.role)
}

/**
 * Check if user is platform admin
 */
export async function isPlatformAdmin(): Promise<boolean> {
  return hasRole('platform_admin')
}

/**
 * Check if user is organization admin
 */
export async function isOrgAdmin(): Promise<boolean> {
  return hasRole(['org_admin', 'platform_admin'])
}

/**
 * Check if user is staff or admin
 */
export async function isStaff(): Promise<boolean> {
  return hasRole(['staff', 'org_admin', 'platform_admin'])
}

/**
 * Get organization ID for current user
 */
export async function getUserOrgId(): Promise<string | null> {
  const profile = await getServerProfile()
  return profile?.org_id || null
}

/**
 * Execute a query with automatic retry on connection errors
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; delayMs?: number } = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 100 } = options
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error

      // Don't retry on auth errors or validation errors
      if (error instanceof Error) {
        const message = error.message.toLowerCase()
        if (
          message.includes('unauthorized') ||
          message.includes('forbidden') ||
          message.includes('validation') ||
          message.includes('duplicate')
        ) {
          throw error
        }
      }

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)))
      }
    }
  }

  throw lastError
}

/**
 * Batch multiple queries for better performance
 */
export async function batchQueries<T>(
  queries: (() => Promise<T>)[]
): Promise<T[]> {
  return Promise.all(queries.map(q => q()))
}

/**
 * Prefetch data for Server Components
 * Use this in layout.tsx or page.tsx to prefetch data
 */
export async function prefetchData<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  // In a real implementation, this would use Next.js unstable_cache
  // For now, just execute the function
  return fn()
}