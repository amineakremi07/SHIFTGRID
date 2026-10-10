import { SPORT_DURATION_MIN, type Sport } from '@/lib/slot-duration'

/**
 * Club (organization) discovery logic. Pure: no React, no Supabase, so it can be
 * tested against fixtures. Rows come from the public (anon) client; the shapes
 * below are exactly the columns anon is allowed to read.
 */

export interface ClubOrgRow {
  id: string
  name: string
  address: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
}

export interface ClubCourtRow {
  id: string
  org_id: string
  sport: string
  price_per_hour: number
  /** Postgres TIME, e.g. "08:00:00". */
  open_time: string
  close_time: string
}

export interface ClubSportSummary {
  sport: Sport
  courts: number
  /** Cheapest slot price in TND for this sport, or null when no court has a price set. */
  startingPrice: number | null
  /** Playing time of one slot in minutes (excludes the 15 min buffer). */
  slotMinutes: number
}

export interface Club {
  id: string
  name: string
  city: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  /** Ordered padel → tennis → football; only sports with at least one active court. */
  sports: ClubSportSummary[]
  totalCourts: number
  /** Minutes after midnight. `closesAt` may equal 1440 (midnight). */
  opensAt: number
  closesAt: number
}

export type SportFilter = 'all' | Sport
export type SortMode = 'name' | 'nearest'

const SPORT_ORDER: Sport[] = ['padel', 'tennis', 'football']
export const SPORT_LABEL: Record<Sport, string> = {
  padel: 'Padel',
  tennis: 'Tennis',
  football: 'Football',
}

function isSport(value: string): value is Sport {
  return value in SPORT_DURATION_MIN
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

/**
 * Join organizations with their active courts. A club with no bookable court is
 * dropped: the page's whole purpose is "pick a venue, then book a slot".
 * Courts with a sport we don't model (or a missing org) are ignored.
 */
export function buildClubs(orgs: ClubOrgRow[], courts: ClubCourtRow[]): Club[] {
  const byOrg = new Map<string, ClubCourtRow[]>()
  for (const court of courts) {
    if (!isSport(court.sport)) continue
    const list = byOrg.get(court.org_id)
    if (list) list.push(court)
    else byOrg.set(court.org_id, [court])
  }

  const clubs: Club[] = []
  for (const org of orgs) {
    const orgCourts = byOrg.get(org.id)
    if (!orgCourts || orgCourts.length === 0) continue

    const sports: ClubSportSummary[] = []
    for (const sport of SPORT_ORDER) {
      const ofSport = orgCourts.filter((c) => c.sport === sport)
      if (ofSport.length === 0) continue
      const slotMinutes = SPORT_DURATION_MIN[sport]
      // price_per_hour defaults to 0 when an owner hasn't set one: not "free".
      const prices = ofSport
        .filter((c) => c.price_per_hour > 0)
        .map((c) => (c.price_per_hour * slotMinutes) / 60)
      sports.push({
        sport,
        courts: ofSport.length,
        startingPrice: prices.length ? Math.min(...prices) : null,
        slotMinutes,
      })
    }

    const opens = orgCourts.map((c) => timeToMinutes(c.open_time))
    // A close at or before the open time means "past midnight" (e.g. 00:00).
    const closes = orgCourts.map((c) => {
      const close = timeToMinutes(c.close_time)
      return close <= timeToMinutes(c.open_time) ? close + 1440 : close
    })

    clubs.push({
      id: org.id,
      name: org.name,
      city: org.city,
      address: org.address,
      latitude: org.latitude,
      longitude: org.longitude,
      sports,
      totalCourts: orgCourts.length,
      opensAt: Math.min(...opens),
      closesAt: Math.max(...closes),
    })
  }
  return clubs
}

/* ------------------------------- searching ------------------------------- */

/** Lowercase and strip diacritics so "Hammamet", "hammamet" and "Hammâmet" match. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

export function filterClubs(
  clubs: Club[],
  { query, sport }: { query: string; sport: SportFilter }
): Club[] {
  const tokens = normalize(query).split(/\s+/).filter(Boolean)

  return clubs.filter((club) => {
    if (sport !== 'all' && !club.sports.some((s) => s.sport === sport)) return false
    if (tokens.length === 0) return true
    const haystack = normalize(`${club.name} ${club.city ?? ''} ${club.address ?? ''}`)
    // Every word must appear, in any order: "padel marsa" finds "Padel Club La Marsa".
    return tokens.every((t) => haystack.includes(t))
  })
}

/* -------------------------------- distance ------------------------------- */

export interface Point {
  lat: number
  lng: number
}

export function distanceKm(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

export function clubDistanceKm(club: Club, from: Point | null): number | null {
  if (!from || club.latitude === null || club.longitude === null) return null
  return distanceKm(from, { lat: club.latitude, lng: club.longitude })
}

/** Alphabetical, or nearest first with location-less clubs last (still listed). */
export function sortClubs(clubs: Club[], mode: SortMode, from: Point | null): Club[] {
  const byName = (a: Club, b: Club) => a.name.localeCompare(b.name)
  if (mode !== 'nearest' || !from) return [...clubs].sort(byName)

  return [...clubs].sort((a, b) => {
    const da = clubDistanceKm(a, from)
    const db = clubDistanceKm(b, from)
    if (da === null && db === null) return byName(a, b)
    if (da === null) return 1
    if (db === null) return -1
    return da - db
  })
}

/* ------------------------------- formatting ------------------------------ */

export function formatMinutes(total: number): string {
  const m = total % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function formatHours(club: Club): string {
  return `${formatMinutes(club.opensAt)} – ${formatMinutes(club.closesAt)}`
}

export function formatTND(amount: number): string {
  return `${Number.isInteger(amount) ? amount : amount.toFixed(2)} TND`
}

/**
 * The cheapest slot to headline on a card. With a sport filter active it is that
 * sport's price, otherwise the cheapest across all sports. Null when no price is set.
 */
export function startingPrice(
  club: Club,
  sport: SportFilter
): { price: number; slotMinutes: number } | null {
  const candidates = club.sports
    .filter((s) => sport === 'all' || s.sport === sport)
    .filter((s): s is ClubSportSummary & { startingPrice: number } => s.startingPrice !== null)
  if (candidates.length === 0) return null
  const cheapest = candidates.reduce((a, b) => (b.startingPrice < a.startingPrice ? b : a))
  return { price: cheapest.startingPrice, slotMinutes: cheapest.slotMinutes }
}

export function formatDistance(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`
}
