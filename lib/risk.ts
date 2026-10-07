/**
 * Anti no-show risk score for a booking, from what is already known about the booker. Pure.
 *
 * It only ever produces a WARNING (a notice to the player and a flag in analytics): it never blocks a
 * booking. Inputs are counts, never names or contacts.
 *
 *   no-shows        30 points each, up to 60 (three no-shows already suspend a member)
 *   cancellations   +20 when half or more of 3+ bookings were cancelled, +10 for 3+ cancellations
 *   late booking    +15 when the slot starts in under 2 h, +25 under 30 min
 *   unknown guest   +10 for a guest with no booking history at all
 */

export type RiskLevel = 'low' | 'medium' | 'high'

export type RiskInput = {
  noShows: number
  cancellations: number
  /** Every booking the person made, whatever its outcome. */
  totalBookings: number
  /** Minutes between now and the start of the slot. */
  leadMinutes: number
  isGuest: boolean
}

export type RiskResult = { score: number; level: RiskLevel; reasons: string[] }

export const RISK_HIGH = 60
export const RISK_MEDIUM = 35

export function bookingRisk(i: RiskInput): RiskResult {
  let score = 0
  const reasons: string[] = []

  if (i.noShows > 0) {
    score += Math.min(60, i.noShows * 30)
    reasons.push(`${i.noShows} previous no-show${i.noShows === 1 ? '' : 's'}`)
  }
  if (i.totalBookings >= 3 && i.cancellations / i.totalBookings >= 0.5) {
    score += 20
    reasons.push('many cancellations')
  } else if (i.cancellations >= 3) {
    score += 10
    reasons.push('repeated cancellations')
  }
  if (i.leadMinutes < 30) {
    score += 25
    reasons.push('booked less than 30 minutes ahead')
  } else if (i.leadMinutes < 120) {
    score += 15
    reasons.push('booked less than 2 hours ahead')
  }
  if (i.isGuest && i.totalBookings === 0) {
    score += 10
    reasons.push('first booking as a guest')
  }

  const level: RiskLevel = score >= RISK_HIGH ? 'high' : score >= RISK_MEDIUM ? 'medium' : 'low'
  return { score, level, reasons }
}

/** Count outcomes from a list of booking statuses. */
export function tallyStatuses(statuses: readonly string[]): { noShows: number; cancellations: number; totalBookings: number } {
  return {
    noShows: statuses.filter((s) => s === 'no_show').length,
    cancellations: statuses.filter((s) => s === 'cancelled').length,
    totalBookings: statuses.length,
  }
}
