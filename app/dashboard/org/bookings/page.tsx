import { redirect } from 'next/navigation'

import { BookingsBoard, type BoardBooking, type BoardCourt } from '@/components/dashboard/bookings-board'
import { generateCourtSlots } from '@/lib/court-slots'
import { addDays, venueDateString, venueInstant } from '@/lib/court-time'
import { effectiveHours, parseWeeklyHours } from '@/lib/operating-hours'
import { getOrgAccess } from '@/lib/org-access'
import { MAX_DAYS_AHEAD } from '@/lib/booking-core'
import { SPORT_DURATION_MIN, type Sport } from '@/lib/slot-duration'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const DATE = /^\d{4}-\d{2}-\d{2}$/
/** Staff can look back this far (reconciling last month's cash, say). */
const DAYS_BACK = 60

export default async function OrgBookingsPage({ searchParams }: { searchParams?: Promise<{ date?: string }> }) {
  const access = await getOrgAccess()
  if (access.kind !== 'ok') redirect('/dashboard/org')
  const { ctx } = access

  const today = venueDateString()
  const minDate = addDays(today, -DAYS_BACK)
  const maxDate = addDays(today, MAX_DAYS_AHEAD)
  const requested = (await searchParams)?.date
  const asked = requested && DATE.test(requested) ? requested : today
  const day = asked < minDate ? minDate : asked > maxDate ? maxDate : asked

  // Everything below runs as the signed-in user: RLS limits it to this club.
  const supabase = await createClient()
  const dayStart = venueInstant(day, 0).toISOString()
  const dayEnd = venueInstant(day, 1440).toISOString()

  const [orgRes, courtsRes, bookingsRes] = await Promise.all([
    supabase.from('organizations').select('weekly_hours').eq('id', ctx.orgId).maybeSingle(),
    supabase
      .from('courts')
      .select('id, name, sport, status, open_time, close_time, price_per_hour, night_surcharge_per_hour, night_starts_at')
      .eq('org_id', ctx.orgId)
      .order('name'),
    supabase
      .from('bookings')
      .select('id, court_id, sport, booker_profile_id, booker_anon_id, starts_at, ends_at, player_count, status')
      .eq('org_id', ctx.orgId)
      .gte('starts_at', dayStart)
      .lt('starts_at', dayEnd)
      .order('starts_at'),
  ])

  if (orgRes.error || courtsRes.error || bookingsRes.error) {
    console.error('Failed to load bookings board:', {
      org: orgRes.error?.message,
      courts: courtsRes.error?.message,
      bookings: bookingsRes.error?.message,
    })
    return (
      <div role="alert" className="rounded-xl bg-[#eae6df] px-6 py-10 text-center text-sm">
        We couldn&apos;t load the schedule. Please refresh in a moment.
      </div>
    )
  }

  const rows = bookingsRes.data ?? []
  const anonIds = [...new Set(rows.map((b) => b.booker_anon_id).filter((v): v is string => Boolean(v)))]
  const profileIds = [...new Set(rows.map((b) => b.booker_profile_id).filter((v): v is string => Boolean(v)))]
  const bookingIds = rows.map((b) => b.id)

  const [anonRes, profileRes, payRes] = await Promise.all([
    anonIds.length
      ? supabase.from('anonymous_bookers').select('id, name, phone').in('id', anonIds)
      : Promise.resolve({ data: [], error: null }),
    profileIds.length
      ? supabase.from('profiles').select('id, display_name, phone').in('id', profileIds)
      : Promise.resolve({ data: [], error: null }),
    bookingIds.length
      ? supabase.from('payment_records').select('booking_id, amount').in('booking_id', bookingIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (anonRes.error || profileRes.error || payRes.error) {
    console.error('Failed to load booking details:', {
      anon: anonRes.error?.message,
      profiles: profileRes.error?.message,
      payments: payRes.error?.message,
    })
  }

  const anon = new Map((anonRes.data ?? []).map((a) => [a.id, a]))
  const profiles = new Map((profileRes.data ?? []).map((p) => [p.id, p]))
  const amounts = new Map((payRes.data ?? []).map((p) => [p.booking_id, Number(p.amount)]))

  const bookings: BoardBooking[] = rows.map((b) => {
    const guest = b.booker_anon_id ? anon.get(b.booker_anon_id) : undefined
    const member = b.booker_profile_id ? profiles.get(b.booker_profile_id) : undefined
    return {
      id: b.id,
      courtId: b.court_id,
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      status: b.status,
      playerCount: b.player_count,
      bookerName: guest?.name ?? member?.display_name ?? 'Unknown',
      bookerPhone: guest?.phone ?? member?.phone ?? null,
      isMember: Boolean(member),
      amount: amounts.get(b.id) ?? null,
      reference: b.id.replace(/-/g, '').slice(0, 8).toUpperCase(),
    }
  })

  const weekly = parseWeeklyHours(orgRes.data?.weekly_hours)
  const now = new Date()
  const courts: BoardCourt[] = (courtsRes.data ?? []).flatMap((c) => {
    if (!(c.sport in SPORT_DURATION_MIN)) return []
    const hours = effectiveHours(weekly, day, c)
    return [
      {
        id: c.id,
        name: c.name,
        sport: c.sport as Sport,
        status: c.status,
        pricePerHour: Number(c.price_per_hour),
        nightSurchargePerHour: Number(c.night_surcharge_per_hour),
        nightStartsAt: c.night_starts_at,
        closed: !hours,
        slots: hours
          ? generateCourtSlots({
              sport: c.sport as Sport,
              openTime: hours.openTime,
              closeTime: hours.closeTime,
              dateStr: day,
              locks: [],
              now,
            }).map((s) => ({ start: s.start, end: s.end, past: s.state === 'past' }))
          : [],
      },
    ]
  })

  return <BookingsBoard dateStr={day} today={today} minDate={minDate} maxDate={maxDate} courts={courts} bookings={bookings} />
}
