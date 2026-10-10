'use client'

import * as React from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { fr } from 'react-day-picker/locale'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { addDays, formatVenueDate } from '@/lib/court-time'

/**
 * Day navigation for a club's availability: previous / next day, a calendar, and
 * a shortcut back to today. Dates are venue calendar days as YYYY-MM-DD strings,
 * never `Date` objects in the browser's timezone, so "today" means today in Tunis.
 */

/** A YYYY-MM-DD string as a local-midnight Date, which is what the calendar widget wants. */
function toCalendarDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function fromCalendarDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function DayPicker({
  dateStr,
  minDate,
  maxDate,
  onChange,
  pending = false,
}: {
  dateStr: string
  /** Earliest bookable day (venue today). */
  minDate: string
  /** Latest bookable day. */
  maxDate: string
  onChange: (dateStr: string) => void
  /** A new day is loading. */
  pending?: boolean
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <Button
        variant="outline"
        size="icon"
        className="max-md:size-12"
        aria-label="Jour précédent"
        disabled={dateStr <= minDate}
        onClick={() => onChange(addDays(dateStr, -1))}
      >
        <ChevronLeft aria-hidden />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="min-w-44 justify-center tabular-nums max-md:h-12 max-md:flex-1">
            <CalendarDays aria-hidden />
            {formatVenueDate(dateStr)}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            locale={fr}
            selected={toCalendarDate(dateStr)}
            defaultMonth={toCalendarDate(dateStr)}
            onSelect={(date) => {
              if (!date) return
              onChange(fromCalendarDate(date))
              setOpen(false)
            }}
            disabled={{ before: toCalendarDate(minDate), after: toCalendarDate(maxDate) }}
          />
        </PopoverContent>
      </Popover>

      <Button
        variant="outline"
        size="icon"
        className="max-md:size-12"
        aria-label="Jour suivant"
        disabled={dateStr >= maxDate}
        onClick={() => onChange(addDays(dateStr, 1))}
      >
        <ChevronRight aria-hidden />
      </Button>

      {dateStr !== minDate && (
        <Button variant="ghost" className="max-md:h-12 max-md:px-4" onClick={() => onChange(minDate)}>
          Aujourd&apos;hui
        </Button>
      )}
    </div>
  )
}
