/**
 * "Add to calendar" for a booking: a Google Calendar link and an .ics file (Apple Calendar, Outlook,
 * most mail apps). Pure: the same code builds the on-screen buttons and the email attachment.
 * Times are real instants (ISO), written in UTC, so no time zone data is needed.
 */

export type CalendarEvent = {
  /** Stable id so re-adding the same booking updates instead of duplicating. */
  uid: string
  title: string
  startsAt: string
  endsAt: string
  location?: string | null
  description?: string | null
}

const stamp = (iso: string): string => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export function googleCalendarUrl(e: CalendarEvent): string {
  const params = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${stamp(e.startsAt)}/${stamp(e.endsAt)}` })
  if (e.location) params.set('location', e.location)
  if (e.description) params.set('details', e.description)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

const escapeText = (v: string) => v.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')

/** RFC 5545: lines over 75 octets are folded with CRLF + space. */
const bytes = (v: string) => new TextEncoder().encode(v).length

function fold(line: string): string {
  const out: string[] = []
  let rest = line
  while (bytes(rest) > 75) {
    let cut = 75
    while (bytes(rest.slice(0, cut)) > 75) cut--
    out.push(rest.slice(0, cut))
    rest = ` ${rest.slice(cut)}`
  }
  out.push(rest)
  return out.join('\r\n')
}

export function icsContent(e: CalendarEvent, now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ShiftGrid//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid.replace(/[^\w@.-]/g, '')}@shiftgrid`,
    `DTSTAMP:${stamp(now.toISOString())}`,
    `DTSTART:${stamp(e.startsAt)}`,
    `DTEND:${stamp(e.endsAt)}`,
    `SUMMARY:${escapeText(e.title)}`,
    e.location ? `LOCATION:${escapeText(e.location)}` : null,
    e.description ? `DESCRIPTION:${escapeText(e.description)}` : null,
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Your game starts in 2 hours',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((l): l is string => l !== null)
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** Event for a booking from display-ready facts. */
export function bookingCalendarEvent(p: {
  bookingId: string
  clubName: string
  courtName: string
  sport: string
  startsAt: string
  endsAt: string
  address?: string | null
  reference?: string
}): CalendarEvent {
  return {
    uid: p.bookingId,
    title: `${p.sport ? p.sport.charAt(0).toUpperCase() + p.sport.slice(1) : 'Game'} at ${p.clubName}`,
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    location: [p.clubName, p.address].filter(Boolean).join(', '),
    description: `Court: ${p.courtName}${p.reference ? `\nReference: ${p.reference}` : ''}\nBooked with ShiftGrid`,
  }
}
