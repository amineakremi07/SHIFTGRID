import { headers } from 'next/headers'

import { resolveAppUrl } from '@/lib/app-url'

/**
 * The origin the CURRENT request came to (the browser's own site). Use it for Supabase Auth redirects
 * (sign-up confirmation, ...): the PKCE verifier cookie lives on that origin, so the emailed link must
 * come back to the same one, whatever NEXT_PUBLIC_APP_URL says (local dev can point at production).
 * Falls back to the configured URL outside a request.
 */
export async function requestOrigin(): Promise<string> {
  try {
    const h = await headers()
    const host = h.get('x-forwarded-host') ?? h.get('host')
    if (host) {
      const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
      return `${proto}://${host}`
    }
  } catch {
    /* no request scope */
  }
  return resolveAppUrl()
}

export async function appOrigin(): Promise<string> {
  // NEXT_PUBLIC_APP_URL, else the production site (lib/app-url.ts). Never the request's host.
  return resolveAppUrl()
}
