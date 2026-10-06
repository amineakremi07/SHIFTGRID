/**
 * Venue time helpers.
 *
 * Every court is in Tunisia, which is UTC+1 all year (no daylight saving since
 * 2009). Slot times are real instants (timestamptz in the database) that must be
 * *displayed* in venue time, otherwise a visitor's browser timezone would shift
 * "18:00" to something else. Dates ("2026-10-01") mean the venue's calendar day.
 */

export const VENUE_TZ = 'Africa/Tunis'
const VENUE_OFFSET_MS = 60 * 60 * 1000

/** The instant that is `minutes` after 00:00 venue time on `dateStr` (YYYY-MM-DD). */
export function venueInstant(dateStr: string, minutes: number): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + minutes * 60_000 - VENUE_OFFSET_MS)
}

/** Whole minutes from the start of the venue day `dateStr` to `instant`. */
export function minutesSinceVenueDayStart(instant: Date | string, dateStr: string): number {
  const at = typeof instant === 'string' ? new Date(instant) : instant
  return Math.round((at.getTime() - venueInstant(dateStr, 0).getTime()) / 60_000)
}

/** Venue calendar date (YYYY-MM-DD) of an instant. */
export function venueDateString(instant: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: VENUE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}

/** Add whole days to a YYYY-MM-DD date string. */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + days))
  return next.toISOString().slice(0, 10)
}

/** "18:00" in venue time. */
/** "18:00 - 19:30" in venue time, the `time_slot` value used by analytics events. */
export function timeSlotLabel(startsAt: Date | string, endsAt: Date | string): string {
  return `${formatVenueTime(startsAt)} - ${formatVenueTime(endsAt)}`
}

export function formatVenueTime(instant: Date | string): string {
  const at = typeof instant === 'string' ? new Date(instant) : instant
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: VENUE_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at)
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * "Tue 29 Sep 2026" for a venue date string. Built by hand rather than with Intl
 * so the text is identical across ICU versions and browsers (Intl varies on the
 * comma and on "Sep" vs "Sept").
 */
export function formatVenueDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${weekday} ${d} ${MONTHS[m - 1]} ${y}`
}

/** Postgres TIME ("08:00:00") to minutes after midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}
