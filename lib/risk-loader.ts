import { bookingRisk, tallyStatuses, type RiskResult } from '@/lib/risk'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'

/**
 * Looks up the booker's history (counts only) and scores the booking. Never throws: when the history
 * cannot be read the booking is treated as low risk, because a warning must not become an outage.
 *
 * Members are found by account; guests by phone number across every club (the same person booking at
 * another club still counts), using only the status of each past booking.
 */
export async function assessBookingRisk(input: {
  profileId?: string
  guestPhone?: string
  startsAt: string
  now?: Date
}): Promise<RiskResult> {
  const now = input.now ?? new Date()
  const leadMinutes = Math.round((Date.parse(input.startsAt) - now.getTime()) / 60_000)
  const isGuest = !input.profileId
  try {
    const admin = getSupabaseAdmin()
    let statuses: string[] = []

    if (input.profileId) {
      const { data } = await admin.from('bookings').select('status').eq('booker_profile_id', input.profileId).limit(200)
      statuses = (data ?? []).map((b) => b.status)
    } else if (input.guestPhone) {
      const { data: bookers } = await admin.from('anonymous_bookers').select('id').eq('phone', input.guestPhone).limit(20)
      const ids = (bookers ?? []).map((b) => b.id)
      if (ids.length) {
        const { data } = await admin.from('bookings').select('status').in('booker_anon_id', ids).limit(200)
        statuses = (data ?? []).map((b) => b.status)
      }
    }
    return bookingRisk({ ...tallyStatuses(statuses), leadMinutes, isGuest })
  } catch {
    return { score: 0, level: 'low', reasons: [] }
  }
}
