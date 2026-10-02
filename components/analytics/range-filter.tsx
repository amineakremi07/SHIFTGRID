'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import type { DateRange as PickerRange } from 'react-day-picker'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatVenueDate } from '@/lib/court-time'
import { MAX_RANGE_DAYS, PRESET_LABEL, type RangePreset } from '@/lib/analytics'
import { cn } from '@/lib/utils'

const QUICK: Exclude<RangePreset, 'custom'>[] = ['7d', '30d', 'month', 'ytd']

const toCalendarDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const fromCalendarDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Date range controls. The range lives in the URL (?range=…&from=…&to=…) so the
 * page is server-rendered for it, shareable, and survives a refresh. The server
 * validates and clamps whatever arrives; this only builds the links.
 */
export function RangeFilter({
  preset,
  from,
  to,
  today,
}: {
  preset: RangePreset
  from: string
  to: string
  /** Venue today, the last selectable day. */
  today: string
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<PickerRange | undefined>(undefined)

  const apply = () => {
    if (!draft?.from) return
    const start = fromCalendarDate(draft.from)
    const end = fromCalendarDate(draft.to ?? draft.from)
    router.push(`/dashboard/org/analytics?range=custom&from=${start}&to=${end}`)
    setOpen(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav aria-label="Date range" className="flex flex-wrap gap-1 rounded-lg bg-[#eae6df] p-1">
        {QUICK.map((key) => (
          <Link
            key={key}
            href={`/dashboard/org/analytics?range=${key}`}
            aria-current={preset === key ? 'true' : undefined}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              preset === key ? 'bg-[#f7f5f2] text-[#1d3023]' : 'text-[#645757] hover:text-[#2a1a1d]'
            )}
          >
            {PRESET_LABEL[key]}
          </Link>
        ))}
      </nav>

      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) setDraft({ from: toCalendarDate(from), to: toCalendarDate(to) })
        }}
      >
        <PopoverTrigger asChild>
          <Button variant={preset === 'custom' ? 'secondary' : 'outline'} className="tabular-nums">
            <CalendarDays aria-hidden />
            {preset === 'custom' ? `${formatVenueDate(from)} – ${formatVenueDate(to)}` : 'Custom range'}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={draft}
            defaultMonth={toCalendarDate(from)}
            onSelect={setDraft}
            max={MAX_RANGE_DAYS}
            disabled={{ after: toCalendarDate(today) }}
          />
          <div className="flex items-center justify-between gap-3 border-t border-[#d7d2cc] p-3">
            <p className="text-xs text-[#645757]">Up to {MAX_RANGE_DAYS} days, ending no later than today.</p>
            <Button onClick={apply} disabled={!draft?.from}>
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
