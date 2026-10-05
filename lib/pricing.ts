/**
 * Booking price. The ONE implementation: the drawer shows it and the server
 * action recomputes it from the database row before charging, so what a player
 * sees is what is recorded. All amounts are TND.
 */

export interface PriceInput {
  /** Base hourly rate of the court. */
  pricePerHour: number
  /**
   * Flat night fee in TND, added once to the slot price when any part of the slot is at or after
   * `nightStartsAtMinutes`. 0 = none. (The name and the `night_surcharge_per_hour` column predate the
   * flat-fee rule; they hold this flat amount.)
   */
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
  /** Flat night fee: the full amount when the slot reaches night time, else 0. */
  surcharge: number
  /** Minutes of the booking at or after night start (decides whether the flat fee applies). */
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
  const surcharge = surchargeMinutes > 0 ? round2(nightSurchargePerHour) : 0

  return { durationMinutes, base, surcharge, surchargeMinutes, total: round2(base + surcharge) }
}

/** TND for one slot of `slotMinutes` at the hourly rate (what the owner and player see). */
export function slotPrice(pricePerHour: number, slotMinutes: number): number {
  return round2((pricePerHour * slotMinutes) / 60)
}

/**
 * The hourly rate to store for a price entered per slot. Kept to 4 decimals so that
 * `slotPrice(hourlyFromSlotPrice(p, m), m) === p` (50 TND / 90 min = 33.3333/h).
 */
export function hourlyFromSlotPrice(slotPriceTnd: number, slotMinutes: number): number {
  return Math.round(((slotPriceTnd * 60) / slotMinutes + Number.EPSILON) * 10000) / 10000
}

/** "1.5h" / "1h": a slot length as owners say it. */
export function slotHoursLabel(slotMinutes: number): string {
  return `${slotMinutes / 60}h`
}
