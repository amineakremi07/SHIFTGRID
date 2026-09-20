import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Optimized Supabase client for Server Components
 * Callers: lib/actions/staff-invites.ts, lib/actions/player-auth.ts, lib/actions/admin-verification.ts
 * Affected API: Supabase Admin & Server Clients
 * Data schemas: Supabase Client interfaces
 * User instruction: fix the 3 bugs first then hop on next task
 */

// Singleton pattern for client reuse within a request
let serverClientInstance: ReturnType<typeof createServerClient> | null = null

/**
 * Get or create the Supabase server client
 * Reuses the same client within a single request
 */
export async function getSupabaseServerClient() {
  if (serverClientInstance) {
    return serverClientInstance
  }

  const cookieStore = await cookies()

  serverClientInstance = createServerClient(
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
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
      // Optimize for Server Components
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  )

  return serverClientInstance
}

/**
 * Create a new Supabase client for API routes
 * Uses service role key for admin operations
 */
export function createAdminClient() {
  const { createClient } = require('@supabase/supabase-js')
  return createClient(
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
  const { createBrowserClient: createClient } = require('@supabase/ssr')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

/**
 * Clear the singleton instance (useful for testing or request boundaries)
 */
export function clearServerClientInstance() {
  serverClientInstance = null
}

/**
 * Get user session from server client
 */
export async function getServerSession() {
  const supabase = await getSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
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
    .select('id, role, organization_id, full_name, avatar_url')
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
  return profile?.organization_id || null
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