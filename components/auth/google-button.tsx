'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { trackEvent } from '@/components/providers/posthog-provider'
import { OAUTH_COOKIE } from '@/lib/auth-callback'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.7-4.9H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.4a7.2 7.2 0 0 1 0-4.8V6.5H1.3a12 12 0 0 0 0 11l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.3 6.5l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
    </svg>
  )
}

/**
 * "Continue with Google" through Supabase Auth (PKCE). The browser leaves for Google and comes back to
 * /auth/callback, which signs the visitor in (or creates their player profile at `orgId`) and then
 * follows `next`. Needs the Google provider enabled in the Supabase dashboard and the callback URL on
 * the Redirect URLs list (see supabase/config.toml).
 */
export function GoogleButton({
  orgId,
  next,
  disabled = false,
  className,
  label = 'Continue with Google',
}: {
  /** The club a NEW Google account joins as a player. Without it only existing accounts can sign in. */
  orgId?: string
  /** Same-site path to return to after sign-in (omit: the role's landing page). */
  next?: string
  disabled?: boolean
  className?: string
  label?: string
}) {
  const [busy, setBusy] = React.useState(false)

  const start = async () => {
    setBusy(true)
    trackEvent('auth.google_clicked', { club_id: orgId ?? null })
    // The club and return path travel in a short-lived cookie (read once by /auth/callback), so the
    // redirect URL is exactly the one on Supabase's allow-list, with no query string to match.
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${OAUTH_COOKIE}=${encodeURIComponent(JSON.stringify({ club: orgId ?? null, next: next ?? null }))}; Path=/auth; Max-Age=600; SameSite=Lax${secure}`
    const { error } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setBusy(false)
      toast.error('Google sign-in is not available right now. Please use another way to continue.')
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={start}
      disabled={disabled || busy}
      className={cn('h-12 w-full gap-3 text-base font-medium', className)}
    >
      {busy ? <Loader2 className="animate-spin" aria-hidden /> : <GoogleMark />}
      {label}
    </Button>
  )
}
