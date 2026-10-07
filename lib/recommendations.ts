import { venueWeekdayHour } from '@/lib/demand'

/**
 * "Recommended for you": the slot a signed-in player tends to book, learned from their own past
 * bookings at this club (favourite weekday + hour). Pure.
 */

export type Favourite = { weekday: number; hour: number }

/** Bookings needed before a habit is claimed. */
export const FAVOURITE_MIN_BOOKINGS = 2

/** The most frequent (weekday, hour); ties go to the more recent booking. Null with too little history. */
export function favouriteSlot(pastStarts: readonly string[]): Favourite | null {
  if (pastStarts.length < FAVOURITE_MIN_BOOKINGS) return null
  const tally = new Map<string, { fav: Favourite; n: number; latest: number }>()
  for (const iso of pastStarts) {
    const { weekday, hour } = venueWeekdayHour(iso)
    const key = `${weekday}-${hour}`
    const at = Date.parse(iso)
    const entry = tally.get(key) ?? { fav: { weekday, hour }, n: 0, latest: 0 }
    entry.n += 1
    entry.latest = Math.max(entry.latest, at)
    tally.set(key, entry)
  }
  const best = [...tally.values()].sort((a, b) => b.n - a.n || b.latest - a.latest)[0]
  // One-off bookings are not a habit: the favourite must repeat, or the history be tiny.
  return best.n >= 2 || pastStarts.length <= 3 ? best.fav : null
}

/** A slot matches the habit on the same weekday and hour. */
export function isRecommended(slotStart: string, favourite: Favourite | null): boolean {
  if (!favourite) return false
  const { weekday, hour } = venueWeekdayHour(slotStart)
  return weekday === favourite.weekday && hour === favourite.hour
}
