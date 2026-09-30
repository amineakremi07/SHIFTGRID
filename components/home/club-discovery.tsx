'use client'

import * as React from 'react'
import Link from 'next/link'
import { LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight,
  Building2,
  Calendar,
  Clock,
  LayoutGrid,
  Loader2,
  MapPin,
  Navigation,
  Search,
  Trophy,
  X,
  Zap,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SPRING } from '@/components/ui/motion-button'
import {
  SPORT_LABEL,
  clubDistanceKm,
  filterClubs,
  formatCourtCounts,
  formatDistance,
  formatHours,
  formatTND,
  sortClubs,
  startingPrice,
  type Club,
  type Point,
  type SortMode,
  type SportFilter,
} from '@/lib/clubs'
import { cn } from '@/lib/utils'

/* ==========================================================================
   Organization-first discovery: find a club, then open its courts and slots.
   Rows arrive pre-aggregated from the server (real data via the public client).
   ========================================================================== */

const SPORT_TABS: { value: SportFilter; label: string; icon: typeof Zap }[] = [
  { value: 'all', label: 'All', icon: LayoutGrid },
  { value: 'padel', label: 'Padel', icon: Zap },
  { value: 'tennis', label: 'Tennis', icon: Trophy },
  { value: 'football', label: 'Football', icon: Calendar },
]

type GeoStatus =
  | 'idle'
  | 'locating'
  | 'denied'
  | 'timeout'
  | 'unavailable'
  | 'unsupported'

/** Filled Forest Depths: keeps Lime Pulse to a single action per viewport. */
const ACTIVE_FILTER =
  'border-forest-depths bg-forest-depths text-bone-linen hover:bg-forest-depths/90 hover:text-bone-linen'

function ClubCard({
  club,
  sport,
  distanceKm,
  animate,
}: {
  club: Club
  sport: SportFilter
  distanceKm: number | null
  animate: boolean
}) {
  const headingId = `club-${club.id}`
  const price = startingPrice(club, sport)

  return (
    <motion.li
      layout={animate ? 'position' : false}
      variants={
        animate
          ? { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }
          : undefined
      }
      whileHover={animate ? { y: -2 } : undefined}
      transition={SPRING}
      className="flex"
    >
      <article
        aria-labelledby={headingId}
        className="flex w-full flex-col rounded-xl bg-card p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              id={headingId}
              className="text-lg font-semibold leading-tight tracking-tight"
            >
              {club.name}
            </h3>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{club.city ?? 'Tunisia'}</span>
            </p>
          </div>
          {distanceKm !== null && (
            <Badge variant="outline" className="shrink-0 tabular-nums">
              {formatDistance(distanceKm)}
            </Badge>
          )}
        </div>

        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Sports offered">
          {club.sports.map((s) => (
            <li key={s.sport}>
              <Badge variant={sport === s.sport ? 'success' : 'secondary'}>
                {SPORT_LABEL[s.sport]}
              </Badge>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <dt className="sr-only">Opening hours</dt>
            <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <dd className="tabular-nums">Open today: {formatHours(club)}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="sr-only">Courts</dt>
            <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <dd>{formatCourtCounts(club)}</dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-1 flex-wrap items-end justify-between gap-3">
          <p className="text-sm">
            {price ? (
              <>
                <span className="text-muted-foreground">From </span>
                <span className="font-semibold tabular-nums">
                  {formatTND(price.price)}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {' '}
                  / {price.slotMinutes} min
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">Price on request</span>
            )}
          </p>

          <Button asChild className={ACTIVE_FILTER}>
            {/* Described by the club name so a screen reader hears which club. */}
            <Link href={`/courts/${club.id}`} aria-describedby={headingId}>
              View Slots &amp; Book
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </article>
    </motion.li>
  )
}

export function ClubDiscovery({
  clubs,
  loadFailed = false,
}: {
  clubs: Club[]
  /** The server could not read clubs; distinct from "there are none yet". */
  loadFailed?: boolean
}) {
  const reduce = useReducedMotion()
  const animate = !reduce

  const [query, setQuery] = React.useState('')
  const [sport, setSport] = React.useState<SportFilter>('all')
  const [sort, setSort] = React.useState<SortMode>('name')
  const [position, setPosition] = React.useState<Point | null>(null)
  const [geoStatus, setGeoStatus] = React.useState<GeoStatus>('idle')

  const visible = React.useMemo(
    () => sortClubs(filterClubs(clubs, { query, sport }), sort, position),
    [clubs, query, sport, sort, position]
  )

  const toggleNearest = () => {
    if (sort === 'nearest') return setSort('name')
    if (position) return setSort('nearest')
    if (!('geolocation' in navigator)) return setGeoStatus('unsupported')

    setGeoStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setSort('nearest')
        setGeoStatus('idle')
      },
      (error) =>
        setGeoStatus(
          error.code === error.PERMISSION_DENIED
            ? 'denied'
            : error.code === error.TIMEOUT
              ? 'timeout'
              : 'unavailable'
        ),
      { timeout: 10_000, maximumAge: 5 * 60_000 }
    )
  }

  const clearFilters = () => {
    setQuery('')
    setSport('all')
  }

  // Location worked, but none of the listed clubs has coordinates to rank by.
  const nearestUnranked =
    sort === 'nearest' &&
    position !== null &&
    visible.length > 0 &&
    visible.every((c) => c.latitude === null || c.longitude === null)

  const notice =
    geoStatus === 'denied'
      ? 'Location access was declined, so clubs are listed alphabetically.'
      : geoStatus === 'timeout'
        ? 'Finding your location took too long. Please try again.'
        : geoStatus === 'unavailable'
          ? 'Your location could not be determined right now.'
          : geoStatus === 'unsupported'
            ? 'Your browser does not support location lookup.'
            : nearestUnranked
              ? 'None of these clubs have shared a map location yet, so they cannot be ranked by distance.'
              : null

  return (
    <section
      id="discover"
      aria-labelledby="discover-title"
      className="mx-auto w-full max-w-[1920px] scroll-mt-6 px-4 py-16 sm:px-6 lg:px-8 xl:px-12 md:py-20"
    >
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Discover
      </p>
      <h2
        id="discover-title"
        className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl"
      >
        Find a Sports Club Near You
      </h2>
      <p className="mt-2 max-w-[60ch] text-muted-foreground">
        Search by club or place, choose your sport, then open a venue to see its
        courts and live availability.
      </p>

      {/* --------------------------- search bar --------------------------- */}
      <div className="mt-8 flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            // type="text", not "search": browsers draw their own clear (x) on
            // search inputs, which doubled up with our custom button below.
            type="text"
            role="searchbox"
            enterKeyHint="search"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clubs or venues (e.g., 'Padel Club La Marsa')..."
            aria-label="Search clubs or venues"
            autoComplete="off"
            className="h-12 pl-11 pr-11 text-base"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>

        <Button
          variant="outline"
          aria-pressed={sort === 'nearest'}
          aria-busy={geoStatus === 'locating'}
          onClick={toggleNearest}
          // Only disabled while a lookup is in flight (prevents double prompts).
          disabled={geoStatus === 'locating'}
          className={cn(
            'h-12 min-w-44 justify-center px-5 text-base',
            sort === 'nearest' && ACTIVE_FILTER
          )}
        >
          {geoStatus === 'locating' ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Navigation aria-hidden />
          )}
          {geoStatus === 'locating' ? 'Locating…' : 'Nearest to me'}
        </Button>
      </div>

      {/* One bar for the sport filter. LayoutGroup namespaces the layoutId. */}
      <LayoutGroup id="club-discovery">
        <div
          role="group"
          aria-label="Filter by sport"
          // Canvas-coloured track with a hairline: the Oat Milk hover below would
          // be invisible on an Oat Milk track.
          className="mt-4 inline-flex w-fit max-w-full flex-wrap gap-1 rounded-xl border border-border bg-background p-1"
        >
          {SPORT_TABS.map(({ value, label, icon: Icon }) => {
            const active = sport === value
            return (
              <motion.button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => setSport(value)}
                whileHover={animate && !active ? { y: -1 } : undefined}
                whileTap={animate ? { scale: 0.96 } : undefined}
                transition={SPRING}
                className={cn(
                  'relative rounded-lg px-4 py-2 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50',
                  // Oat Milk (#eae6df) on hover; the active tab is covered by the pill.
                  !active && 'hover:bg-card'
                )}
              >
                {active &&
                  (animate ? (
                    <motion.span
                      layoutId="activeSportTab"
                      transition={SPRING}
                      className="absolute inset-0 rounded-lg bg-forest-depths"
                    />
                  ) : (
                    <span className="absolute inset-0 rounded-lg bg-forest-depths" />
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
              </motion.button>
            )
          })}
        </div>
      </LayoutGroup>

      <div aria-live="polite" className="mt-4 min-h-6 text-sm text-muted-foreground">
        {notice ??
          (clubs.length > 0
            ? `${visible.length} ${visible.length === 1 ? 'club' : 'clubs'}${
                sort === 'nearest' && position ? ' · nearest first' : ''
              }`
            : null)}
      </div>

      {/* ------------------------------ results ------------------------------ */}
      {loadFailed ? (
        <EmptyState
          title="We couldn't load clubs right now"
          body="Please refresh the page in a moment."
        />
      ) : clubs.length === 0 ? (
        <EmptyState
          title="No clubs are listed yet"
          body="Clubs appear here once they are verified and have courts set up."
          action={
            <Button asChild variant="outline">
              <Link href="/register?role=owner">List your club</Link>
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No clubs match your search"
          body="Try a different name or place, or another sport."
          action={
            <Button variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <motion.ul
          className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5"
          initial={animate ? 'hidden' : false}
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.05 } } }}
        >
          {visible.map((club) => (
            <ClubCard
              key={club.id}
              club={club}
              sport={sport}
              distanceKm={clubDistanceKm(club, position)}
              animate={animate}
            />
          ))}
        </motion.ul>
      )}
    </section>
  )
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <div className="mt-2 rounded-xl bg-card px-6 py-12 text-center">
      <Building2 className="mx-auto size-8 text-muted-foreground" aria-hidden />
      <p className="mt-4 text-lg font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-[46ch] text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export default ClubDiscovery
