import { createClient } from '@/lib/supabase/client'
import type { Sport } from '@/lib/slot-duration'
import { SPORT_DURATION_MIN, BUFFER_MIN, generateSlotIntervals } from '@/lib/slot-duration'

export interface SlotInterval {
  start: string
  end: string
  state: 'available' | 'occupied' | 'locked_buffer' | 'past'
  bookingId?: string | null
}

/**
 * Resolve court availability for a given date: returns every configured slot
 * with its real state (available / occupied / locked_buffer / past).
 * Combines court_slot_locks (manual blocks + auto buffer) and bookings.
 */
export async function resolveCourtSlots(
  courtId: string,
  sport: Sport,
  dateStr: string, // YYYY-MM-DD
  opts: { openHour?: number; closeHour?: number } = {}
): Promise<SlotInterval[]> {
  const open = opts.openHour ?? 7
  const close = opts.closeHour ?? 22
  const baseSlots = generateSlotIntervals(sport, open, close, dateStr)
  const supabase = createClient()

  // fetch locks within the day range for this court
  const { data: locks } = await supabase
    .from('court_slot_locks')
    .select('starts_at, ends_at, booking_id')
    .eq('court_id', courtId)
    .gte('starts_at', `${dateStr}T00:00:00`)
    .lte('starts_at', `${dateStr}T23:59:59`)

  // fetch bookings within the day range for this court
  const { data: bookings } = await supabase
    .from('bookings')
    .select('starts_at, ends_at, id')
    .eq('court_id', courtId)
    .gte('starts_at', `${dateStr}T00:00:00`)
    .lte('starts_at', `${dateStr}T23:59:59`)

  const now = new Date().toISOString()

  const intervals: SlotInterval[] = baseSlots.map((s) => {
    const lock = (locks ?? []).find((l: any) => l.starts_at === s.start)
    const booking = (bookings ?? []).find((b: any) => b.starts_at === s.start)

    // past if start already elapsed
    if (s.start < now) return { ...s, state: 'past' }

    // locked buffer when a lock exists whose buffer period overlaps slot start
    const slotDuration = (SPORT_DURATION_MIN[sport] ?? 60) + (BUFFER_MIN ?? 15)
    const bufferEnd = new Date(new Date(s.start).getTime() + slotDuration * 60_000).toISOString()
    if (lock && new Date(lock.ends_at) > new Date(s.start)) {
      return { ...s, state: 'locked_buffer', bookingId: lock.booking_id ?? booking?.id ?? null }
    }

    if (booking) return { ...s, state: 'occupied', bookingId: booking.id }
    return { ...s, state: 'available', bookingId: null }
  })

  return intervals
}

/**
 * Flat list of free (available) slot start-times for a court on a given day — legacy helper.
 */
export async function getFreeSlots(
  orgId: string,
  courtId: string,
  dateStr: string
): Promise<string[]> {
  const sport: Sport = 'padel'
  const resolved = await resolveCourtSlots(courtId, sport, dateStr)
  return resolved.filter((s) => s.state === 'available').map((s) => s.start)
}