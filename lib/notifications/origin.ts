import { headers } from 'next/headers'

/**
 * The site's public origin, for links inside emails: the configured URL when there is
 * one, else the request's host. Call it BEFORE `after()` (request headers are not
 * available once the response is on its way) and pass the string along.
 */
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
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

export async function appOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}
