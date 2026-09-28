'use client'

import * as React from 'react'
import { LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import {
  Calendar as CalendarIcon,
  CalendarDays,
  Loader2,
  Navigation,
  Trophy,
  Wallet,
  Zap,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { SPRING } from '@/components/ui/motion-button'
import {
  CourtSlotMatrix,
  buildMockCourts,
  type MatrixCourt,
} from '@/components/courts/court-slot-matrix'
import type { Sport } from '@/lib/slot-duration'
import { cn } from '@/lib/utils'

/* ==========================================================================
   Sport discovery hub: sport selector + quick filters + the slot matrix.
   Owns the shared state so the sport bar drives the matrix directly.
   ========================================================================== */

const SPORTS: { value: Sport; label: string; icon: typeof Zap }[] = [
  { value: 'padel', label: 'Padel', icon: Zap },
  { value: 'tennis', label: 'Tennis', icon: Trophy },
  { value: 'football', label: 'Football', icon: CalendarIcon },
]

const TIME_WINDOWS = [
  { value: 'any', label: 'Any time', test: () => true },
  { value: 'morning', label: 'Morning', test: (h: number) => h < 12 },
  { value: 'afternoon', label: 'Afternoon', test: (h: number) => h >= 12 && h < 17 },
  { value: 'evening', label: 'Evening', test: (h: number) => h >= 17 },
] as const
type TimeWindow = (typeof TIME_WINDOWS)[number]['value']

type SortMode = 'default' | 'nearest' | 'cheapest'
type GeoStatus = 'idle' | 'locating' | 'denied' | 'unsupported'

/**
 * Mock coordinates (Greater Tunis) keyed by the matrix's mock court ids.
 * `organizations` has no lat/lng columns yet, so real distances need a schema
 * change. The geolocation + haversine below are real; only this table is fake.
 */
const MOCK_COURT_COORDS: Record<string, { lat: number; lng: number }> = {
  'mock-padel-1': { lat: 36.8382, lng: 10.2051 },
  'mock-padel-2': { lat: 36.7969, lng: 10.1716 },
  'mock-tennis-1': { lat: 36.8467, lng: 10.2741 },
  'mock-football-1': { lat: 36.7325, lng: 10.2081 },
}

function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/** Local-calendar YYYY-MM-DD. `toISOString()` would shift the day across UTC. */
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fromDateStr(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** False on the server and during hydration, true afterwards. */
function useHydrated() {
  return React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
}

const ACTIVE_FILTER =
  'border-forest-depths bg-forest-depths text-bone-linen hover:bg-forest-depths/90 hover:text-bone-linen'

export function DiscoveryHub() {
  const reduce = useReducedMotion()
  const hydrated = useHydrated()

  const [sport, setSport] = React.useState<Sport>('padel')
  const [sort, setSort] = React.useState<SortMode>('default')
  const [timeWindow, setTimeWindow] = React.useState<TimeWindow>('any')
  const [dateOpen, setDateOpen] = React.useState(false)

  // Lazy initialisers run on the server too, but neither value is rendered
  // until `hydrated`, so the build-time date never reaches the page.
  const [today] = React.useState(() => fromDateStr(toDateStr(new Date())))
  const [date, setDate] = React.useState(() => toDateStr(new Date()))

  const [position, setPosition] = React.useState<{ lat: number; lng: number } | null>(null)
  const [geoStatus, setGeoStatus] = React.useState<GeoStatus>('idle')

  const courts = React.useMemo<MatrixCourt[]>(() => {
    const test = TIME_WINDOWS.find((w) => w.value === timeWindow)!.test
    let list = buildMockCourts(date).map((c) => ({
      ...c,
      slots: c.slots.filter((s) => test(new Date(s.start).getHours())),
    }))

    if (sort === 'cheapest') {
      list = [...list].sort((a, b) => a.pricePerHour - b.pricePerHour)
    } else if (sort === 'nearest' && position) {
      const km = (c: MatrixCourt) =>
        MOCK_COURT_COORDS[c.id]
          ? distanceKm(position, MOCK_COURT_COORDS[c.id])
          : Infinity
      list = [...list].sort((a, b) => km(a) - km(b))
    }
    return list
  }, [date, timeWindow, sort, position])

  const toggleCheapest = () =>
    setSort((s) => (s === 'cheapest' ? 'default' : 'cheapest'))

  const toggleNearest = () => {
    if (sort === 'nearest') return setSort('default')
    if (position) return setSort('nearest')
    if (!('geolocation' in navigator)) return setGeoStatus('unsupported')

    setGeoStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setSort('nearest')
        setGeoStatus('idle')
      },
      () => setGeoStatus('denied'),
      { timeout: 10_000, maximumAge: 5 * 60_000 }
    )
  }

  // Caption that explains the current ordering, with the numbers behind it.
  const sportCourts = courts.filter((c) => c.sport === sport)
  const caption =
    sort === 'nearest' && position
      ? `Nearest first — ${sportCourts
          .map((c) => {
            const p = MOCK_COURT_COORDS[c.id]
            return p ? `${c.name} ${distanceKm(position, p).toFixed(1)} km` : c.name
          })
          .join(' · ')}`
      : sort === 'cheapest'
        ? `Best price first — ${sportCourts
            .map((c) => `${c.name} ${c.pricePerHour} TND/h`)
            .join(' · ')}`
        : null

  const geoMessage =
    geoStatus === 'denied'
      ? 'Location access was declined, so courts are shown in default order.'
      : geoStatus === 'unsupported'
        ? 'Your browser does not support location lookup.'
        : null

  const dateLabel = hydrated
    ? new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).format(fromDateStr(date))
    : 'Pick a date'
  const windowLabel = TIME_WINDOWS.find((w) => w.value === timeWindow)!.label

  return (
    <section
      id="discover"
      aria-labelledby="discover-title"
      className="mx-auto w-full max-w-[1200px] scroll-mt-6 px-5 py-16 md:py-20"
    >
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Discover
      </p>
      <h2
        id="discover-title"
        className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl"
      >
        Find a court that fits your game
      </h2>
      <p className="mt-2 max-w-[60ch] text-muted-foreground">
        Pick a sport, narrow by price, distance or time, then choose an open
        slot.
      </p>

      {/* --------------------------- controls --------------------------- */}
      <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Sport selector. The matrix hides its own tabs in controlled mode,
            so this bar owns `activeSportTab`. LayoutGroup namespaces the id. */}
        <LayoutGroup id="discovery">
          <div
            role="group"
            aria-label="Sport"
            className="inline-flex w-fit gap-1 rounded-xl bg-card p-1"
          >
            {SPORTS.map(({ value, label, icon: Icon }) => {
              const active = sport === value
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSport(value)}
                  className="relative rounded-lg px-4 py-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {active &&
                    (reduce ? (
                      <span className="absolute inset-0 rounded-lg bg-forest-depths" />
                    ) : (
                      <motion.span
                        layoutId="activeSportTab"
                        transition={SPRING}
                        className="absolute inset-0 rounded-lg bg-forest-depths"
                      />
                    ))}
                  <span
                    className={cn(
                      'relative z-10 flex items-center gap-2 transition-colors',
                      active
                        ? 'text-bone-linen'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {label}
                  </span>
                </button>
              )
            })}
          </div>
        </LayoutGroup>

        {/* Quick filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            aria-pressed={sort === 'nearest'}
            onClick={toggleNearest}
            disabled={geoStatus === 'locating'}
            className={cn(sort === 'nearest' && ACTIVE_FILTER)}
          >
            {geoStatus === 'locating' ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Navigation aria-hidden />
            )}
            Nearest to me
          </Button>

          <Button
            variant="outline"
            aria-pressed={sort === 'cheapest'}
            onClick={toggleCheapest}
            className={cn(sort === 'cheapest' && ACTIVE_FILTER)}
          >
            <Wallet aria-hidden />
            Best price
          </Button>

          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="tabular-nums">
                <CalendarDays aria-hidden />
                {dateLabel}
                {timeWindow !== 'any' && (
                  <span className="text-muted-foreground">· {windowLabel}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={fromDateStr(date)}
                defaultMonth={fromDateStr(date)}
                onSelect={(d) => d && setDate(toDateStr(d))}
                disabled={{ before: today }}
              />
              <div
                role="group"
                aria-label="Time of day"
                className="flex flex-wrap gap-1.5 border-t border-border p-3"
              >
                {TIME_WINDOWS.map((w) => (
                  <Button
                    key={w.value}
                    size="sm"
                    variant="outline"
                    aria-pressed={timeWindow === w.value}
                    onClick={() => setTimeWindow(w.value)}
                    className={cn(timeWindow === w.value && ACTIVE_FILTER)}
                  >
                    {w.label}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div aria-live="polite" className="min-h-6">
        {(caption || geoMessage) && (
          <p className="mt-3 text-sm text-muted-foreground">
            {geoMessage ?? caption}
          </p>
        )}
      </div>

      {/* ---------------------------- matrix ---------------------------- */}
      <div className="mt-4">
        {hydrated ? (
          <CourtSlotMatrix
            // Remount on date/window change so a stale selection can't survive.
            key={`${date}-${timeWindow}`}
            courtData={courts}
            selectedDate={date}
            sport={sport}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2" aria-hidden>
            <Skeleton className="h-[420px] rounded-xl" />
            <Skeleton className="hidden h-[420px] rounded-xl md:block" />
          </div>
        )}
      </div>
    </section>
  )
}

export default DiscoveryHub
