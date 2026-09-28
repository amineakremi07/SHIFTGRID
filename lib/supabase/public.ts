import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

/**
 * Session-less Supabase client for PUBLIC marketplace reads.
 *
 * Always acts as the `anon` role, even when the visitor is signed in, so the
 * public court pages show identical data to everyone. The RLS policies and
 * column grants for `anon` (see 20260929000000_backend_remediation.sql) are what
 * make this safe: only approved organizations and active courts are readable,
 * and only the public organization columns.
 *
 * It deliberately reads no cookies. Pages using it must opt out of static
 * prerendering (`export const dynamic = 'force-dynamic'`) or Next would bake
 * build-time data into the HTML.
 */
export function createPublicClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
