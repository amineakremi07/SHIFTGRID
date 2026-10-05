/**
 * Turning an OpenStreetMap Nominatim reverse-geocoding answer into the club's address line.
 * Pure (no network, no server imports), so the formatting is unit-tested.
 *
 * Format: "Street / Avenue, City, Postal Code, Country". Any part Nominatim does not know is
 * skipped; if it knows neither a street nor a city there is nothing useful to fill in (null),
 * and the form keeps whatever the owner typed.
 */

export type ReverseAddress = {
  /** The whole line: "12 Avenue Habib Bourguiba, Tunis, 1001, Tunisie". */
  address: string
  street: string | null
  city: string | null
  postcode: string | null
  country: string | null
}

type NominatimAddress = Record<string, unknown>

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)
const first = (a: NominatimAddress, keys: readonly string[]): string | null => {
  for (const key of keys) {
    const v = text(a[key])
    if (v) return v
  }
  return null
}

/** Road-like names, most specific first. Tunisian results often have no house number. */
const STREET_KEYS = ['road', 'pedestrian', 'footway', 'path', 'residential', 'cycleway', 'neighbourhood', 'suburb', 'quarter'] as const
/** The locality, from a city down to a village. */
const CITY_KEYS = ['city', 'town', 'village', 'municipality', 'city_district', 'county'] as const

export function formatReverseAddress(data: unknown): ReverseAddress | null {
  if (!data || typeof data !== 'object') return null
  const a = (data as { address?: unknown }).address
  if (!a || typeof a !== 'object') return null
  const address = a as NominatimAddress

  const road = first(address, STREET_KEYS)
  const number = text(address.house_number)
  const street = road ? (number ? `${number} ${road}` : road) : null
  const city = first(address, CITY_KEYS)
  const postcode = text(address.postcode)
  const country = text(address.country)

  if (!street && !city) return null

  const seen = new Set<string>()
  const parts = [street, city, postcode, country].filter((p): p is string => {
    if (!p) return false
    const key = p.toLowerCase()
    if (seen.has(key)) return false // e.g. a street named after the town
    seen.add(key)
    return true
  })

  return { address: parts.join(', '), street, city, postcode, country }
}

/** Show "address · city" without repeating the city when the address line already contains it. */
export function displayAddress(address: string | null | undefined, city: string | null | undefined): string {
  const a = (address ?? '').trim()
  const c = (city ?? '').trim()
  if (a && c && !a.toLowerCase().includes(c.toLowerCase())) return `${a} · ${c}`
  return a || c
}
