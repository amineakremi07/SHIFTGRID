import { headers } from 'next/headers'

/**
 * The site's public origin, for links inside emails: the configured URL when there is
 * one, else the request's host. Call it BEFORE `after()` (request headers are not
 * available once the response is on its way) and pass the string along.
 */
export async function appOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}
