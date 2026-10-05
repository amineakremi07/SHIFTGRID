/**
 * The site's public origin, used for every link we put in an email (booking pass, cancel link, staff
 * invitation, split-payment invite). Pure (no request or server imports), so it is unit-tested.
 *
 * `NEXT_PUBLIC_APP_URL` when it is set, otherwise the production site below. There is deliberately no
 * guess from the request's host: a link in an email must point at the real site even when the booking
 * was made from a preview deployment or a local dev server.
 *
 * If the production domain ever changes, change DEFAULT_APP_URL, supabase/config.toml (Site URL and
 * redirect URLs) and the NEXT_PUBLIC_APP_URL variable on Vercel together (it is inlined at build time:
 * redeploy after changing it).
 */
export const DEFAULT_APP_URL = 'https://shiftgridtn.vercel.app'

export function resolveAppUrl(configured: string | undefined | null = process.env.NEXT_PUBLIC_APP_URL): string {
  const value = (configured ?? '').trim()
  return (/^https?:\/\/[^/\s]+/.test(value) ? value : DEFAULT_APP_URL).replace(/\/+$/, '')
}
