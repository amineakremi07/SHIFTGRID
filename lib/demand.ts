import { minutesSinceVenueDayStart, venueDateString } from '@/lib/court-time'

/**
 * Demand badges for the slot grid ("High demand", "Quiet"), from the club's own booking history.
 * Pure: the loader feeds it the start times of the club's recent bookings.
 *
 * Occupancy of a (weekday, hour) = bookings that started in that hour / (weeks observed x courts):
 * a court starts at most one slot per hour, so the ratio is the share of court-hours that were taken.
 * With too little history (a new club) the badges fall back to a fixed rule (evening = high demand,
 * weekday afternoon = quiet) so a new club still gets sensible hints. These badges are informational:
 * they never change the price (prices come from `computePrice` only).
 */

export type DemandLevel = 'high' | 'quiet' | 'normal'

/** Bookings needed before the club's own numbers are trusted over the fixed rule. */
export const DEMAND_MIN_SAMPLE = 30
export const DEMAND_HIGH_RATIO = 0.6
export const DEMAND_QUIET_RATIO = 0.2
export const DEMAND_WINDOW_WEEKS = 8

export type DemandProfile = {
  /** Number of bookings the ratios come from. */
  sample: number
  /** `${weekday}-${hour}` (venue time, weekday 0 = Sunday) -> share of court-hours taken, 0..1. */
  ratios: Record<string, number>
}

export const demandKey = (weekday: number, hour: number) => `${weekday}-${hour}`

/** Weekday (0 = Sunday) and hour (0-23) of an instant, in venue time. */
export function venueWeekdayHour(instant: string): { weekday: number; hour: number } {
  const date = venueDateString(new Date(instant))
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  return { weekday, hour: Math.floor(minutesSinceVenueDayStart(instant, date) / 60) }
}

/** The fixed rule used while a club has too little history: 18:00-20:59 busy, Mon-Fri 12:00-15:59 quiet. */
export function fallbackDemand(weekday: number, hour: number): DemandLevel {
  if (hour >= 18 && hour < 21) return 'high'
  if (weekday >= 1 && weekday <= 5 && hour >= 12 && hour < 16) return 'quiet'
  return 'normal'
}

/** Same profile from counts the database already grouped by venue weekday + hour (see `club_demand_counts`). */
export function demandProfileFromCounts(
  rows: readonly { weekday: number; hour: number; n: number }[],
  courtCount: number,
  weeksObserved: number
): DemandProfile {
  const capacity = Math.max(1, courtCount) * Math.max(1, weeksObserved)
  const ratios: Record<string, number> = {}
  let sample = 0
  for (const { weekday, hour, n } of rows) {
    sample += n
    // One row per (weekday, hour): the database already grouped them.
    ratios[demandKey(weekday, hour)] = Math.min(1, n / capacity)
  }
  return { sample, ratios }
}

export function buildDemandProfile(startsAt: readonly string[], courtCount: number, weeksObserved: number): DemandProfile {
  const counts: Record<string, number> = {}
  for (const iso of startsAt) {
    const { weekday, hour } = venueWeekdayHour(iso)
    const key = demandKey(weekday, hour)
    counts[key] = (counts[key] ?? 0) + 1
  }
  const capacity = Math.max(1, courtCount) * Math.max(1, weeksObserved)
  const ratios: Record<string, number> = {}
  for (const [key, n] of Object.entries(counts)) ratios[key] = Math.min(1, n / capacity)
  return { sample: startsAt.length, ratios }
}

export function demandFor(profile: DemandProfile | null, weekday: number, hour: number): DemandLevel {
  if (!profile || profile.sample < DEMAND_MIN_SAMPLE) return fallbackDemand(weekday, hour)
  const ratio = profile.ratios[demandKey(weekday, hour)] ?? 0
  if (ratio >= DEMAND_HIGH_RATIO) return 'high'
  if (ratio <= DEMAND_QUIET_RATIO) return 'quiet'
  return 'normal'
}
