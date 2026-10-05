'use server'

import { TUNISIA_BOUNDS } from '@/lib/club-profile'
import { formatReverseAddress, type ReverseAddress } from '@/lib/geocode'
import { LEGAL_CONTACT_EMAIL } from '@/lib/legal'
import { requireOrgAction } from '@/lib/org-access'
import { actionRateLimit } from '@/lib/rate-limit'

export type ReverseGeocodeResult =
  | ({ ok: true } & ReverseAddress)
  | { ok: false; reason: 'invalid' | 'rate_limited' | 'not_found' | 'unavailable'; message: string }

/**
 * "What address is under the pin?" for the club owner's location settings, answered by OpenStreetMap's
 * Nominatim (no API key). Only a signed-in club owner can call it (so it is not an open proxy to a
 * free service), it is rate limited, answers are cached for a day (Nominatim's usage policy), and any
 * failure is a plain `ok: false`: the form keeps what the owner typed and the pin still saves.
 */
export async function reverseGeocodeAction(latitude: number, longitude: number): Promise<ReverseGeocodeResult> {
  const auth = await requireOrgAction(['org_admin'])
  if (!auth.ok) return { ok: false, reason: 'invalid', message: auth.message }

  const { latMin, latMax, lngMin, lngMax } = TUNISIA_BOUNDS
  if (
    typeof latitude !== 'number' || typeof longitude !== 'number' ||
    !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    latitude < latMin || latitude > latMax || longitude < lngMin || longitude > lngMax
  ) {
    return { ok: false, reason: 'invalid', message: 'That spot is outside Tunisia.' }
  }

  const limited = await actionRateLimit('lookup', auth.ctx.userId)
  if (limited) return { ok: false, reason: 'rate_limited', message: limited }

  // 5 decimals is about one metre: neighbouring drags share the cached answer.
  const lat = latitude.toFixed(5)
  const lon = longitude.toFixed(5)
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=fr,ar,en&lat=${lat}&lon=${lon}`,
      {
        headers: { 'User-Agent': `ShiftGrid/1.0 (${LEGAL_CONTACT_EMAIL})`, Accept: 'application/json' },
        signal: AbortSignal.timeout(6000),
        next: { revalidate: 60 * 60 * 24 },
      }
    )
    if (res.status === 429) return { ok: false, reason: 'rate_limited', message: 'The address service is busy. Please try again in a moment.' }
    if (!res.ok) return { ok: false, reason: 'unavailable', message: 'The address service is not available right now.' }

    const formatted = formatReverseAddress(await res.json())
    if (!formatted) return { ok: false, reason: 'not_found', message: 'No street address was found at that spot.' }
    return { ok: true, ...formatted }
  } catch {
    return { ok: false, reason: 'unavailable', message: 'The address service did not answer.' }
  }
}
