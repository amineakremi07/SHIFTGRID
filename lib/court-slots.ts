import { BUFFER_MIN, SPORT_DURATION_MIN, type Sport } from '@/lib/slot-duration'
import { timeToMinutes, venueInstant } from '@/lib/court-time'

/**
 * Bookable slots of one court on one venue day.
 *
 * A slot is the playing time (60 min tennis, 90 min padel/football). After it the
 * court is held for a 15 min buffer, so slots repeat every duration + 15 min
 * (padel: 08:00, 09:45, 11:30 ...). The database enforces the same range
 * [start, start + duration + buffer) with a GiST exclusion constraint.
 */

export type SlotState = 'available' | 'occupied' | 'locked_buffer' | 'past'

export interface CourtSlot {
  /** ISO instant of the start of play. */
  start: string
  /** ISO instant of the end of play (excludes the buffer). */
  end: string
  state: SlotState
  bookingId?: string | null
  /** Only for holds that expire; real bookings never set it. */
  lockExpiresAt?: string | null
}

export interface LockRange {
  /** ISO instants from court_slot_locks.occupied_from / occupied_until. */
  from: string
  until: string
}

export function generateCourtSlots(input: {
  sport: Sport
  /** Postgres TIME, e.g. "08:00:00". */
  openTime: string
  closeTime: string
  /** Venue calendar day, YYYY-MM-DD. */
  dateStr: string
  locks: LockRange[]
  now: Date
}): CourtSlot[] {
  const { sport, openTime, closeTime, dateStr, locks, now } = input

  const duration = SPORT_DURATION_MIN[sport]
  const step = duration + BUFFER_MIN
  const open = timeToMinutes(openTime)
  // A close at or before the open time means "past midnight" (e.g. 00:00).
  const rawClose = timeToMinutes(closeTime)
  const close = rawClose <= open ? rawClose + 1440 : rawClose

  const lockRanges = locks.map((l) => ({
    from: new Date(l.from).getTime(),
    until: new Date(l.until).getTime(),
  }))

  const slots: CourtSlot[] = []
  for (let start = open; start + duration <= close; start += step) {
    const startAt = venueInstant(dateStr, start)
    const endAt = venueInstant(dateStr, start + duration)
    const heldUntil = endAt.getTime() + BUFFER_MIN * 60_000

    let state: SlotState = 'available'
    if (startAt.getTime() <= now.getTime()) {
      state = 'past'
    } else if (lockRanges.some((l) => l.from < heldUntil && l.until > startAt.getTime())) {
      state = 'occupied'
    }

    slots.push({ start: startAt.toISOString(), end: endAt.toISOString(), state })
  }
  return slots
}
