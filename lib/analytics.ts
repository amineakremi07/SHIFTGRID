/**
 * Club analytics: date ranges and aggregation. Pure (no I/O) so the numbers can
 * be checked without a database; lib/analytics-loader.ts feeds it rows.
 *
 * Definitions, kept in one place so the page can state them:
 *  - A booking belongs to the venue day it STARTS on (Africa/Tunis).
 *  - Revenue = value of non-cancelled bookings whose payment is not refunded.
 *    "Collected" is the paid part; "outstanding" is still owed (cash at the club).
 *  - Cancelled bookings are never revenue; their value is "lost to cancellations".
 *  - Occupancy = booked minutes / opening minutes of active courts, per hour of
 *    the day, over the days of the range (buffers between slots are not counted
 *    as booked, so a full day reads below 100%).
 *  - Peak hours = 17:00 to 04:59 (evening and late night); off-peak = the rest.
 */
import { addDays, timeToMinutes, venueDateString } from './court-time'

export const PRESETS = ['7d', '30d', 'month', 'ytd', 'custom'] as const
export type RangePreset = (typeof PRESETS)[number]

export const PRESET_LABEL: Record<RangePreset, string> = {
  '7d': '7 derniers jours',
  '30d': '30 derniers jours',
  month: 'Ce mois-ci',
  ytd: 'Depuis le 1er janvier',
  custom: 'Personnalisée',
}

export const MAX_RANGE_DAYS = 366
const DATE = /^\d{4}-\d{2}-\d{2}$/

export type DateRange = { preset: RangePreset; from: string; to: string }

function isRealDate(value: string | undefined): value is string {
  if (!value || !DATE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === value
}

export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

/** Every date from `from` to `to`, inclusive. */
export function eachDate(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const sundayFirst = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return addDays(date, -((sundayFirst + 6) % 7))
}

export const monthStart = (date: string) => `${date.slice(0, 8)}01`
export const yearStart = (date: string) => `${date.slice(0, 4)}-01-01`

/**
 * Turn URL params into a valid range. Anything missing or malformed falls back
 * to the last 30 days; the end is never after `today`, and a custom range is
 * capped at a year so a crafted URL cannot ask for unbounded work.
 */
export function resolveRange(
  params: { range?: string; from?: string; to?: string },
  today: string
): DateRange {
  const preset = (PRESETS as readonly string[]).includes(params.range ?? '') ? (params.range as RangePreset) : '30d'
  switch (preset) {
    case '7d':
      return { preset, from: addDays(today, -6), to: today }
    case 'month':
      return { preset, from: monthStart(today), to: today }
    case 'ytd':
      return { preset, from: yearStart(today), to: today }
    case 'custom': {
      if (isRealDate(params.from) && isRealDate(params.to)) {
        let to = params.to > today ? today : params.to
        let from = params.from > to ? to : params.from
        if (daysBetween(from, to) >= MAX_RANGE_DAYS) from = addDays(to, -(MAX_RANGE_DAYS - 1))
        to = to < from ? from : to
        return { preset, from, to }
      }
      return { preset: '30d', from: addDays(today, -29), to: today }
    }
    default:
      return { preset: '30d', from: addDays(today, -29), to: today }
  }
}

// ---------------------------------------------------------------------------
// Aggregation

export type BookingInput = {
  id: string
  court_id: string | null
  starts_at: string
  ends_at: string
  status: 'pending_payment' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
  booker_profile_id: string | null
  booker_anon_id: string | null
  /** payment_records of this booking (one in practice). */
  payments: { amount: number; status: 'pending' | 'paid' | 'refunded'; provider: 'stripe' | 'cash' | 'clicktopay' | 'test' }[]
}

export type CourtInput = {
  id: string
  name: string
  sport: string
  status: string
  open_time: string
  close_time: string
}

/** weekday-aware hours resolver, injected so this file stays dependency-free. */
export type HoursFor = (date: string, court: CourtInput) => { openTime: string; closeTime: string } | null

export type Period = { revenue: number; collected: number; bookings: number }

export type Analytics = {
  range: DateRange & { days: number }
  periods: { today: Period; week: Period; month: Period; ytd: Period }
  kpis: {
    revenue: number
    collected: number
    outstanding: number
    bookings: number
    avgPerBooking: number
    /** null when no court had opening hours in the range. */
    occupancy: number | null
  }
  payments: { key: string; label: string; count: number; amount: number }[]
  trend: { granularity: 'day' | 'week' | 'month'; points: TrendPoint[] }
  hours: HourStat[]
  peak: { peak: number | null; offPeak: number | null }
  courts: CourtStat[]
  players: {
    members: { bookings: number; revenue: number }
    guests: { bookings: number; revenue: number }
    uniqueBookers: number
    returning: number
    returningRate: number | null
  }
  cancellations: { count: number; total: number; rate: number | null; lost: number }
}

export type TrendPoint = { key: string; label: string; bookings: number; cancelled: number; revenue: number }
export type HourStat = { hour: number; label: string; booked: number; available: number; rate: number | null; peak: boolean }
export type CourtStat = { id: string; name: string; sport: string; bookings: number; revenue: number; occupancy: number | null }

const HOUR_MS = 3_600_000
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

export const isPeakHour = (hour: number) => hour >= 17 || hour < 5

/** Money in TND has millimes: keep three decimals and drop float dust. */
const money = (n: number) => Math.round(n * 1000) / 1000
const ratio = (num: number, den: number) => (den > 0 ? num / den : null)
/** Share of opening time that was booked, capped at 100% (hours may have shrunk since). */
const occupancy = (booked: number, available: number) => (available > 0 ? Math.min(1, booked / available) : null)

function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

function bucketOf(date: string, granularity: 'day' | 'week' | 'month'): { key: string; label: string } {
  if (granularity === 'day') return { key: date, label: shortDate(date) }
  if (granularity === 'week') {
    const start = weekStart(date)
    return { key: start, label: `Sem. ${shortDate(start)}` }
  }
  const [y, m] = date.split('-').map(Number)
  return { key: date.slice(0, 7), label: `${MONTHS[m - 1]} ${y}` }
}

/** Minutes of [startMs, endMs) that fall in each venue hour of the day. */
function addMinutesByHour(target: number[], startMs: number, endMs: number) {
  let cursor = startMs
  while (cursor < endMs) {
    const utcHourIndex = Math.floor(cursor / HOUR_MS)
    const boundary = (utcHourIndex + 1) * HOUR_MS
    const slice = Math.min(boundary, endMs) - cursor
    // Venue time is UTC+1 all year, so its hour is the UTC hour plus one.
    target[(utcHourIndex + 1) % 24] += slice / 60_000
    cursor += slice
  }
}

export function computeAnalytics(input: {
  range: DateRange
  today: string
  bookings: BookingInput[]
  courts: CourtInput[]
  hoursFor: HoursFor
}): Analytics {
  const { range, today, bookings, courts, hoursFor } = input
  const days = daysBetween(range.from, range.to) + 1
  const granularity = days <= 31 ? 'day' : days <= 140 ? 'week' : 'month'

  const periodStarts = {
    today,
    week: weekStart(today),
    month: monthStart(today),
    ytd: yearStart(today),
  }
  const blank = (): Period => ({ revenue: 0, collected: 0, bookings: 0 })
  const periods = { today: blank(), week: blank(), month: blank(), ytd: blank() }

  // Trend buckets, in order, zero-filled.
  const trendMap = new Map<string, TrendPoint>()
  for (const date of eachDate(range.from, range.to)) {
    const { key, label } = bucketOf(date, granularity)
    if (!trendMap.has(key)) trendMap.set(key, { key, label, bookings: 0, cancelled: 0, revenue: 0 })
  }

  const courtStats = new Map<string, CourtStat & { bookedMinutes: number; availableMinutes: number }>()
  for (const c of courts) {
    courtStats.set(c.id, {
      id: c.id,
      name: c.name,
      sport: c.sport,
      bookings: 0,
      revenue: 0,
      occupancy: null,
      bookedMinutes: 0,
      availableMinutes: 0,
    })
  }

  // Availability per hour of day, and per court, over the range.
  const availableByHour = new Array<number>(24).fill(0)
  for (const date of eachDate(range.from, range.to)) {
    for (const court of courts) {
      if (court.status !== 'active') continue
      const hours = hoursFor(date, court)
      if (!hours) continue
      const open = timeToMinutes(hours.openTime)
      let close = timeToMinutes(hours.closeTime)
      if (close <= open) close += 1440 // closes after midnight
      const stat = courtStats.get(court.id)!
      for (let t = open; t < close; ) {
        const hour = Math.floor(t / 60)
        const next = Math.min(close, (hour + 1) * 60)
        availableByHour[hour % 24] += next - t
        stat.availableMinutes += next - t
        t = next
      }
    }
  }

  const bookedByHour = new Array<number>(24).fill(0)
  let revenue = 0
  let collected = 0
  let outstanding = 0
  let revenueBookings = 0
  let cancelledCount = 0
  let cancelledValue = 0
  let allInRange = 0
  const members = { bookings: 0, revenue: 0 }
  const guests = { bookings: 0, revenue: 0 }
  const bookerCounts = new Map<string, number>()
  const paymentRows = new Map<string, { key: string; label: string; count: number; amount: number }>([
    ['paid_online', { key: 'paid_online', label: 'Payé en ligne', count: 0, amount: 0 }],
    ['paid_cash', { key: 'paid_cash', label: 'Payé en espèces', count: 0, amount: 0 }],
    ['pending_cash', { key: 'pending_cash', label: 'Espèces à encaisser au club', count: 0, amount: 0 }],
    ['pending_online', { key: 'pending_online', label: 'En ligne, en attente de paiement', count: 0, amount: 0 }],
    ['refunded', { key: 'refunded', label: 'Remboursé', count: 0, amount: 0 }],
  ])

  for (const b of bookings) {
    const startMs = new Date(b.starts_at).getTime()
    const date = venueDateString(new Date(startMs))
    const payment = b.payments[0]
    const amount = payment ? Number(payment.amount) : 0
    const cancelled = b.status === 'cancelled'
    const refunded = payment?.status === 'refunded'
    // A no-show whose cash was never collected earned nothing (and is not "still to collect").
    const forgone = b.status === 'no_show' && payment?.status === 'pending'
    const earns = !cancelled && !refunded && !forgone

    // The fixed headline periods (independent of the chosen range).
    if (earns) {
      for (const key of ['today', 'week', 'month', 'ytd'] as const) {
        if (date >= periodStarts[key] && date <= today) {
          periods[key].revenue += amount
          periods[key].bookings += 1
          if (payment?.status === 'paid') periods[key].collected += amount
        }
      }
    }

    if (date < range.from || date > range.to) continue
    allInRange += 1

    const bucket = trendMap.get(bucketOf(date, granularity).key)
    if (cancelled) {
      cancelledCount += 1
      cancelledValue += amount
      if (bucket) bucket.cancelled += 1
    }

    if (payment && (refunded || !cancelled) && !forgone) {
      const kind = refunded
        ? 'refunded'
        : `${payment.status === 'paid' ? 'paid' : 'pending'}_${payment.provider === 'cash' ? 'cash' : 'online'}`
      const row = paymentRows.get(kind)!
      row.count += 1
      row.amount += amount
    }

    if (!earns) continue

    revenue += amount
    revenueBookings += 1
    if (payment?.status === 'paid') collected += amount
    else outstanding += amount
    if (bucket) {
      bucket.bookings += 1
      bucket.revenue += amount
    }

    const who = b.booker_profile_id ? `p:${b.booker_profile_id}` : b.booker_anon_id ? `a:${b.booker_anon_id}` : null
    if (b.booker_profile_id) {
      members.bookings += 1
      members.revenue += amount
    } else {
      guests.bookings += 1
      guests.revenue += amount
    }
    if (who) bookerCounts.set(who, (bookerCounts.get(who) ?? 0) + 1)

    const minutes = (new Date(b.ends_at).getTime() - startMs) / 60_000
    addMinutesByHour(bookedByHour, startMs, new Date(b.ends_at).getTime())
    const courtKey = b.court_id ?? 'removed'
    let stat = courtStats.get(courtKey)
    if (!stat) {
      stat = {
        id: courtKey,
        name: 'Terrain supprimé',
        sport: '',
        bookings: 0,
        revenue: 0,
        occupancy: null,
        bookedMinutes: 0,
        availableMinutes: 0,
      }
      courtStats.set(courtKey, stat)
    }
    stat.bookings += 1
    stat.revenue += amount
    stat.bookedMinutes += minutes
  }

  const hourStats: HourStat[] = []
  let peakBooked = 0
  let peakAvail = 0
  let offBooked = 0
  let offAvail = 0
  let totalBooked = 0
  let totalAvail = 0
  for (let hour = 0; hour < 24; hour++) {
    const booked = bookedByHour[hour]
    const available = availableByHour[hour]
    const peak = isPeakHour(hour)
    if (available > 0 || booked > 0) {
      hourStats.push({
        hour,
        label: `${String(hour).padStart(2, '0')}:00`,
        booked: Math.round(booked),
        available: Math.round(available),
        rate: occupancy(booked, available),
        peak,
      })
    }
    totalBooked += booked
    totalAvail += available
    if (peak) {
      peakBooked += booked
      peakAvail += available
    } else {
      offBooked += booked
      offAvail += available
    }
  }
  // Order the day as opening hours read: 05:00 ... 23:00, then 00:00 ... 04:00.
  hourStats.sort((a, b) => ((a.hour + 19) % 24) - ((b.hour + 19) % 24))

  const courtList: CourtStat[] = [...courtStats.values()]
    .map((c) => ({
      id: c.id,
      name: c.name,
      sport: c.sport,
      bookings: c.bookings,
      revenue: money(c.revenue),
      occupancy: occupancy(c.bookedMinutes, c.availableMinutes),
    }))
    .filter((c) => c.bookings > 0 || c.occupancy !== null)
    .sort((a, b) => b.revenue - a.revenue || b.bookings - a.bookings || a.name.localeCompare(b.name))

  const unique = bookerCounts.size
  const returning = [...bookerCounts.values()].filter((n) => n >= 2).length

  return {
    range: { ...range, days },
    periods: {
      today: roundPeriod(periods.today),
      week: roundPeriod(periods.week),
      month: roundPeriod(periods.month),
      ytd: roundPeriod(periods.ytd),
    },
    kpis: {
      revenue: money(revenue),
      collected: money(collected),
      outstanding: money(outstanding),
      bookings: revenueBookings,
      avgPerBooking: revenueBookings ? money(revenue / revenueBookings) : 0,
      occupancy: occupancy(totalBooked, totalAvail),
    },
    payments: [...paymentRows.values()].map((r) => ({ ...r, amount: money(r.amount) })),
    trend: {
      granularity,
      points: [...trendMap.values()].map((p) => ({ ...p, revenue: money(p.revenue) })),
    },
    hours: hourStats,
    peak: {
      peak: occupancy(peakBooked, peakAvail),
      offPeak: occupancy(offBooked, offAvail),
    },
    courts: courtList,
    players: {
      members: { bookings: members.bookings, revenue: money(members.revenue) },
      guests: { bookings: guests.bookings, revenue: money(guests.revenue) },
      uniqueBookers: unique,
      returning,
      returningRate: ratio(returning, unique),
    },
    cancellations: {
      count: cancelledCount,
      total: allInRange,
      rate: ratio(cancelledCount, allInRange),
      lost: money(cancelledValue),
    },
  }
}

function roundPeriod(p: Period): Period {
  return { revenue: money(p.revenue), collected: money(p.collected), bookings: p.bookings }
}
