import { computeAnalytics, resolveRange, yearStart, type Analytics, type BookingInput, type DateRange } from '@/lib/analytics'
import { addDays, venueDateString, venueInstant } from '@/lib/court-time'
import { effectiveHours, parseWeeklyHours } from '@/lib/operating-hours'
import { getOrgAccess } from '@/lib/org-access'
import { createClient } from '@/lib/supabase/server'

const PAGE = 1000
/** Safety valve: ~30k bookings in a year is far beyond one club. */
const MAX_PAGES = 30

export type AnalyticsResult =
  | { ok: true; orgName: string; data: Analytics; truncated: boolean }
  | { ok: false; reason: 'forbidden' | 'error' }

/**
 * Load a club's analytics for the URL params.
 *
 * Authorization is decided here, not by the caller: the club is the signed-in
 * owner's own (profiles.org_id via getOrgAccess), never taken from input, and
 * only `org_admin` gets numbers: staff and players are refused before any query
 * runs. Queries then run as the user (not the service role), so RLS is a second
 * lock on top of the explicit org_id filters.
 */
export async function loadOrgAnalytics(params: { range?: string; from?: string; to?: string }): Promise<AnalyticsResult> {
  const access = await getOrgAccess()
  if (access.kind !== 'ok' || access.ctx.role !== 'org_admin' || access.ctx.orgStatus !== 'approved') {
    return { ok: false, reason: 'forbidden' }
  }
  const { orgId, orgName } = access.ctx

  const today = venueDateString()
  const range: DateRange = resolveRange(params, today)
  // The headline cards need the year to date regardless of the chosen range.
  const fetchFrom = range.from < yearStart(today) ? range.from : yearStart(today)
  const fromIso = venueInstant(fetchFrom, 0).toISOString()
  const toIso = venueInstant(addDays(today, 1), 0).toISOString()

  const supabase = await createClient()

  // Started now so they run alongside the (paged) bookings query.
  const sideReads = Promise.all([
    supabase.from('courts').select('id, name, sport, status, deleted_at, open_time, close_time').eq('org_id', orgId),
    supabase.from('organizations').select('weekly_hours').eq('id', orgId).maybeSingle(),
  ])

  const bookings: BookingInput[] = []
  let truncated = false
  for (let page = 0; ; page++) {
    if (page >= MAX_PAGES) {
      truncated = true
      break
    }
    const { data, error } = await supabase
      .from('bookings')
      .select(
        'id, court_id, starts_at, ends_at, status, booker_profile_id, booker_anon_id, payment_records(amount, status, provider)'
      )
      .eq('org_id', orgId)
      .gte('starts_at', fromIso)
      .lt('starts_at', toIso)
      .order('starts_at')
      .order('id')
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) {
      console.error('Analytics bookings query failed:', error.message, error.details)
      return { ok: false, reason: 'error' }
    }
    for (const row of data ?? []) {
      bookings.push({
        id: row.id,
        court_id: row.court_id,
        starts_at: row.starts_at,
        ends_at: row.ends_at,
        status: row.status,
        booker_profile_id: row.booker_profile_id,
        booker_anon_id: row.booker_anon_id,
        payments: (row.payment_records ?? []).map((p) => ({
          amount: Number(p.amount),
          status: p.status,
          provider: p.provider,
        })),
      })
    }
    if ((data?.length ?? 0) < PAGE) break
  }

  const [courtsRes, orgRes] = await sideReads
  if (courtsRes.error || orgRes.error) {
    console.error('Analytics courts/org query failed:', courtsRes.error?.message, orgRes.error?.message)
    return { ok: false, reason: 'error' }
  }
  const weekly = parseWeeklyHours(orgRes.data?.weekly_hours ?? null)

  const data = computeAnalytics({
    range,
    today,
    bookings,
    // An archived court keeps its past revenue but counts for no capacity: it reads as 'archived', not 'active'.
    courts: (courtsRes.data ?? []).map((c) => ({ ...c, status: c.deleted_at ? 'archived' : c.status })),
    hoursFor: (date, court) => effectiveHours(weekly, date, court),
  })
  return { ok: true, orgName, data, truncated }
}
