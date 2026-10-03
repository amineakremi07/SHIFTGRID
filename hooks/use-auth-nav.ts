'use client'

import * as React from 'react'

import { landingPathFor } from '@/lib/auth-landing'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/lib/types/database'

export type AuthNav =
  /** Not known yet: render no auth-specific UI, so signed-in users never flash "Login". */
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'signed_in'; role: UserRole | null }

/**
 * Who is browsing, for navigation only. The landing page is prerendered and
 * cached, so this is read in the browser: the session from `getUser()` (validated
 * with the auth server, not just the cookie) and the caller's own profile role,
 * which RLS lets them read. Purely cosmetic: every protected page and action
 * re-checks on the server.
 */
export function useAuthNav(): AuthNav {
  const [state, setState] = React.useState<AuthNav>({ status: 'loading' })

  React.useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) return setState({ status: 'signed_out' })

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
      if (cancelled) return
      setState({ status: 'signed_in', role: profile?.role ?? null })
    }

    void load()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => void load())

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  return state
}

/**
 * The one link a signed-in person most wants in the header, by role. Managers go to
 * their landing page; a player's is "My reservations" (their post-login landing is
 * the home page, which is where they already are).
 */
export function homeLinkFor(role: UserRole | null): { label: string; href: string } {
  switch (role) {
    case 'org_admin':
    case 'staff':
      return { label: 'Dashboard', href: landingPathFor(role) }
    case 'platform_admin':
      return { label: 'Admin', href: landingPathFor(role) }
    default:
      return { label: 'My reservations', href: '/reservations' }
  }
}
