import { buildDemandProfile, DEMAND_WINDOW_WEEKS, type DemandProfile } from '@/lib/demand'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'

/**
 * Server-side data for the slot hints (demand badges, "Recommended for you"). Only aggregates and the
 * caller's own start times leave this file: no names, contacts or other players' bookings.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Demand of the club over the last weeks, or null when it could not be read (the badges then use the fixed rule). */
export async function loadClubDemand(orgId: string, courtCount: number, now = new Date()): Promise<DemandProfile | null> {
  try {
    const since = new Date(now.getTime() - DEMAND_WINDOW_WEEKS * 7 * DAY_MS).toISOString()
    const { data, error } = await getSupabaseAdmin()
      .from('bookings')
      .select('starts_at')
      .eq('org_id', orgId)
      .neq('status', 'cancelled')
      .gte('starts_at', since)
      .lte('starts_at', now.toISOString())
      .order('starts_at')
      .limit(5000)
    if (error || !data) return null
    const starts = data.map((b) => b.starts_at)
    const first = starts[0] ? Date.parse(starts[0]) : now.getTime()
    const weeks = Math.min(DEMAND_WINDOW_WEEKS, Math.max(1, Math.ceil((now.getTime() - first) / (7 * DAY_MS))))
    return buildDemandProfile(starts, courtCount, weeks)
  } catch {
    return null
  }
}

/** Start times of this player's own past bookings at this club (recent first, capped). */
export async function loadMemberHistory(userId: string, orgId: string, now = new Date()): Promise<string[]> {
  try {
    const { data } = await getSupabaseAdmin()
      .from('bookings')
      .select('starts_at')
      .eq('booker_profile_id', userId)
      .eq('org_id', orgId)
      .in('status', ['confirmed', 'completed', 'pending_payment'])
      .lte('starts_at', now.toISOString())
      .order('starts_at', { ascending: false })
      .limit(40)
    return (data ?? []).map((b) => b.starts_at)
  } catch {
    return []
  }
}
