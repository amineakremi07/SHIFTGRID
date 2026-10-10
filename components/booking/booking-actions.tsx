'use client'

import * as React from 'react'
import { CalendarPlus, MessageCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { trackEvent } from '@/components/providers/posthog-provider'
import { bookingCalendarEvent, googleCalendarUrl, icsContent } from '@/lib/calendar'
import { bookingWhatsappLink, resolveContactNumber } from '@/lib/whatsapp'

export type BookingActionsProps = {
  bookingId: string
  clubName: string
  courtName: string
  sport: string
  /** Display-ready venue date and time range for the WhatsApp message, ex. « mar. 3 nov. 2026 », "18:00 – 19:30". */
  date: string
  time: string
  /** Real instants (ISO) for the calendar. */
  startsAt: string
  endsAt: string
  reference: string
  address?: string | null
  /** The club's own number; the platform contact is used when it is missing. */
  whatsappNumber?: string | null
}

/** "Contact the club on WhatsApp" + "Add to calendar", for the confirmation screen and the pass page. */
export function BookingActions(p: BookingActionsProps) {
  const whatsappHref = bookingWhatsappLink(p.whatsappNumber, {
    clubName: p.clubName,
    date: p.date,
    time: p.time,
    courtName: p.courtName,
    reference: p.reference,
  })
  const isFallback = resolveContactNumber(p.whatsappNumber)?.isFallback ?? false

  const event = bookingCalendarEvent({
    bookingId: p.bookingId,
    clubName: p.clubName,
    courtName: p.courtName,
    sport: p.sport,
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    address: p.address,
    reference: p.reference,
  })

  const downloadIcs = () => {
    trackEvent('add_to_calendar_clicked', { club_name: p.clubName, target: 'ics' })
    const blob = new Blob([icsContent(event)], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `shiftgrid-${p.reference}.ics`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="grid gap-2">
      {whatsappHref && (
        <Button asChild variant="outline" className="h-12 w-full">
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent('whatsapp_contact_clicked', { club_name: p.clubName, fallback: isFallback })}
          >
            <MessageCircle aria-hidden />
            {isFallback ? 'Contacter ShiftGrid sur WhatsApp' : 'Contacter le club sur WhatsApp'}
          </a>
        </Button>
      )}
      <div role="group" aria-label="Ajouter au calendrier" className="grid grid-cols-2 gap-2">
        <Button asChild variant="outline" className="h-12">
          <a
            href={googleCalendarUrl(event)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent('add_to_calendar_clicked', { club_name: p.clubName, target: 'google' })}
          >
            <CalendarPlus aria-hidden />
            Google Calendar
          </a>
        </Button>
        <Button type="button" variant="outline" className="h-12" onClick={downloadIcs}>
          <CalendarPlus aria-hidden />
          Apple / .ics
        </Button>
      </div>
    </div>
  )
}
