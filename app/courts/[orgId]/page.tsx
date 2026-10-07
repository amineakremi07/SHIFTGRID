import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, MapPin } from 'lucide-react'

import type { BookingDrawerMember } from '@/components/booking/booking-drawer'
import type { MatrixCourt } from '@/components/courts/court-slot-matrix'
import { ClubBookingView } from '@/components/courts/club-booking-view'
import { ClubGallery } from '@/components/club/club-gallery'
import { ClubLocation } from '@/components/club/club-location'
import { ownGalleryUrls } from '@/lib/club-profile'
import { demandFor, venueWeekdayHour } from '@/lib/demand'
import { loadClubDemand, loadMemberHistory } from '@/lib/insights-loader'
import { favouriteSlot, isRecommended } from '@/lib/recommendations'
import { displayAddress } from '@/lib/geocode'
import { generateCourtSlots } from '@/lib/court-slots'
import { addDays, venueDateString, venueInstant } from '@/lib/court-time'
import { effectiveHours, parseWeeklyHours, weekdayKey, WEEKDAY_LABELS } from '@/lib/operating-hours'
import { onlinePaymentMode } from '@/lib/payments'
import { SPORT_DURATION_MIN, type Sport } from '@/lib/slot-duration'
import { createClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/supabase/public'

/** Personalised (the drawer knows who is signed in) and live, so never prerendered. */
export const dynamic = 'force-dynamic'

/** How far ahead a slot can be booked; mirrors the server action. */
const MAX_DAYS_AHEAD = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

function isSport(value: string): value is Sport {
  return value in SPORT_DURATION_MIN
}

/** Who is browsing, for the drawer's Member tab. Null when signed out. */
async function loadMember(orgId: string): Promise<{ member: BookingDrawerMember; userId: string } | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, phone, role, org_id')
    .eq('id', user.id)
    .maybeSingle()

  return {
    userId: user.id,
    member: {
      displayName: profile?.display_name ?? user.email ?? 'Your account',
      email: user.email ?? null,
      phone: profile?.phone ?? null,
      role: profile?.role ?? 'unknown',
      isMember: profile?.role === 'player' && profile.org_id === orgId,
    },
  }
}

export default async function ClubPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>
  searchParams?: Promise<{ date?: string }>
}) {
  const { orgId } = await params
  if (!UUID.test(orgId)) notFound()

  // Clamp the requested day into the bookable window (venue time, not the server's).
  const today = venueDateString()
  const maxDate = addDays(today, MAX_DAYS_AHEAD)
  const requested = (await searchParams)?.date
  const dateStr = requested && DATE.test(requested) ? requested : today
  const day = dateStr < today ? today : dateStr > maxDate ? maxDate : dateStr

  // Public (anon) reads: RLS exposes only approved clubs, active courts, and lock ranges.
  const supabase = createPublicClient()

  // The club, its courts and who is browsing do not depend on each other: one round
  // trip. Only the slot locks need the court ids, so they follow.
  const [{ data: org }, { data: courts, error: courtsError }, viewer] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, name, address, city, whatsapp_number, weekly_hours, description, latitude, longitude, gallery_urls')
      .eq('id', orgId)
      .eq('status', 'approved')
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('courts')
      .select('id, name, sport, price_per_hour, open_time, close_time, night_surcharge_per_hour, night_starts_at')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('name'),
    loadMember(orgId),
  ])
  if (!org) notFound()
  const member = viewer?.member ?? null

  // Slot hints, in parallel with the locks below: how busy this club usually is at each hour, and (for a
  // signed-in member) the weekday + hour they usually book. Both fall back quietly when unavailable.
  const [demand, history] = await Promise.all([
    loadClubDemand(orgId, (courts ?? []).length),
    viewer?.member.isMember ? loadMemberHistory(viewer.userId, orgId) : Promise.resolve([] as string[]),
  ])
  const favourite = favouriteSlot(history)

  // Locks overlapping the day (through 24:00 + 24h so late-night slots are covered).
  const courtIds = (courts ?? []).map((c) => c.id)
  const { data: locks, error: locksError } = courtIds.length
    ? await supabase
        .from('court_slot_locks')
        .select('court_id, occupied_from, occupied_until')
        .in('court_id', courtIds)
        .lt('occupied_from', venueInstant(day, 2880).toISOString())
        .gt('occupied_until', venueInstant(day, 0).toISOString())
    : { data: [], error: null }

  // If availability could not be read, say so. Rendering every slot as free would
  // invite players to book slots that are already taken.
  const loadFailed = Boolean(courtsError || locksError)
  if (loadFailed) {
    console.error('Failed to load club availability:', {
      courts: courtsError?.message,
      courtsDetails: courtsError?.details,
      locks: locksError?.message,
      locksDetails: locksError?.details,
    })
  }

  const photos = ownGalleryUrls(org.gallery_urls, org.id, process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
  const hasPin = org.latitude !== null && org.longitude !== null
  const hasProfile = photos.length > 0 || hasPin || Boolean(org.description)

  const now = new Date()
  const weekly = parseWeeklyHours(org.weekly_hours)
  const closedToday = Boolean(weekly && !weekly[weekdayKey(day)].open)
  const matrixCourts: MatrixCourt[] = loadFailed
    ? []
    : (courts ?? []).flatMap((court) => {
        if (!isSport(court.sport)) return []
        const courtLocks = (locks ?? [])
          .filter((l) => l.court_id === court.id)
          .map((l) => ({ from: l.occupied_from, until: l.occupied_until }))

        const hours = effectiveHours(weekly, day, court)

        return [
          {
            id: court.id,
            name: court.name,
            sport: court.sport,
            pricePerHour: Number(court.price_per_hour),
            nightSurchargePerHour: Number(court.night_surcharge_per_hour),
            nightStartsAt: court.night_starts_at,
            slots: hours
              ? generateCourtSlots({
                  sport: court.sport,
                  openTime: hours.openTime,
                  closeTime: hours.closeTime,
                  dateStr: day,
                  locks: courtLocks,
                  now,
                }).map((slot) => {
                  if (slot.state !== 'available') return slot
                  const { weekday, hour } = venueWeekdayHour(slot.start)
                  const level = demandFor(demand, weekday, hour)
                  const tag = isRecommended(slot.start, favourite) ? 'recommended' : level === 'high' ? 'high_demand' : level === 'quiet' ? 'quiet' : undefined
                  return tag ? { ...slot, tag } : slot
                })
              : [],
          },
        ]
      })

  return (
    <main className="mx-auto w-full max-w-[1920px] px-4 py-10 sm:px-6 lg:px-8 xl:px-12">
      <Link
        href="/#discover"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All clubs
      </Link>

      <header className="mb-8 mt-4">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{org.name}</h1>
        <p className="mt-2 flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="size-4 shrink-0" aria-hidden />
          {displayAddress(org.address, org.city) || 'Tunisia'}
        </p>
      </header>

      {hasProfile && (
        <div className="mb-10 grid gap-8 lg:grid-cols-2" data-testid="club-profile">
          {photos.length > 0 && <ClubGallery urls={photos} name={org.name} />}
          <div className={photos.length > 0 ? 'space-y-6' : 'space-y-6 lg:col-span-2'}>
            {org.description && (
              <section aria-labelledby="club-about-heading" className="space-y-2">
                <h2 id="club-about-heading" className="text-lg font-semibold">
                  About
                </h2>
                <p className="max-w-[68ch] whitespace-pre-line leading-relaxed text-muted-foreground" data-testid="club-bio">
                  {org.description}
                </p>
              </section>
            )}
            {hasPin && (
              <ClubLocation name={org.name} address={org.address} latitude={org.latitude as number} longitude={org.longitude as number} />
            )}
          </div>
        </div>
      )}

      {loadFailed ? (
        <div role="alert" className="rounded-xl bg-card px-6 py-12 text-center">
          <p className="text-lg font-semibold">We couldn&apos;t load availability right now</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-sm text-muted-foreground">
            Please refresh in a moment. Slots are not shown, so you can&apos;t book one by mistake.
          </p>
        </div>
      ) : matrixCourts.length === 0 ? (
        <div className="rounded-xl bg-card px-6 py-12 text-center">
          <p className="text-lg font-semibold">No courts are open for booking yet</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-sm text-muted-foreground">
            This club hasn&apos;t set up its courts. Check back soon.
          </p>
        </div>
      ) : (
        <ClubBookingView
          closedNotice={closedToday ? `${org.name} is closed on ${WEEKDAY_LABELS[weekdayKey(day)]}s.` : null}
          orgId={org.id}
          orgName={org.name}
          orgAddress={[org.address, org.city].filter(Boolean).join(', ') || null}
          orgWhatsapp={org.whatsapp_number}
          dateStr={day}
          minDate={today}
          maxDate={maxDate}
          courts={matrixCourts}
          member={member}
          onlineMode={onlinePaymentMode()}
        />
      )}
    </main>
  )
}
