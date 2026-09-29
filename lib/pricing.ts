/**
 * Booking price. The ONE implementation: the drawer shows it and the server
 * action recomputes it from the database row before charging, so what a player
 * sees is what is recorded. All amounts are TND.
 */

export interface PriceInput {
  /** Base hourly rate of the court. */
  pricePerHour: number
  /** Extra TND per hour for time at or after `nightStartsAtMinutes`. 0 = none. */
  nightSurchargePerHour: number
  /** Minutes after midnight when lighting starts to be charged (e.g. 18:00 = 1080). */
  nightStartsAtMinutes: number
  /** Minutes from the start of the venue day to the start of play (may exceed 1440). */
  startMinutes: number
  /** Playing time in minutes (excludes the 15 min buffer). */
  durationMinutes: number
}

export interface PriceBreakdown {
  durationMinutes: number
  /** Court fee for the whole duration at the base rate. */
  base: number
  /** Lighting charge for the part of the booking at or after night start. */
  surcharge: number
  /** How many minutes of the booking the surcharge applies to. */
  surchargeMinutes: number
  total: number
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function computePrice(input: PriceInput): PriceBreakdown {
  const { pricePerHour, nightSurchargePerHour, nightStartsAtMinutes, startMinutes, durationMinutes } = input

  const endMinutes = startMinutes + durationMinutes
  // Everything from night start onwards counts, including past midnight.
  const surchargeMinutes =
    nightSurchargePerHour > 0
      ? Math.max(0, endMinutes - Math.max(startMinutes, nightStartsAtMinutes))
      : 0

  const base = round2((pricePerHour * durationMinutes) / 60)
  const surcharge = round2((nightSurchargePerHour * surchargeMinutes) / 60)

  return { durationMinutes, base, surcharge, surchargeMinutes, total: round2(base + surcharge) }
}
