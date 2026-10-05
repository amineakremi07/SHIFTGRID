import { expect, test } from '@playwright/test'

import { computePrice, hourlyFromSlotPrice, slotPrice } from '../lib/pricing'
import { SPORT_DURATION_MIN } from '../lib/slot-duration'

for (const sport of ['padel', 'football', 'tennis'] as const) {
  test(`${sport}: any slot price survives the hourly round trip`, () => {
    const minutes = SPORT_DURATION_MIN[sport]
    for (const p of [0, 25, 40, 45, 50, 55, 80, 99.9, 120.5, 10000]) {
      const hourly = hourlyFromSlotPrice(p, minutes)
      expect(slotPrice(hourly, minutes)).toBe(p)
      const total = computePrice({
        pricePerHour: hourly,
        nightSurchargePerHour: 0,
        nightStartsAtMinutes: 1080,
        startMinutes: 600,
        durationMinutes: minutes,
      }).total
      expect(total).toBe(p)
    }
  })
}

const flat = (startMinutes: number, durationMinutes: number, fee: number) =>
  computePrice({ pricePerHour: 40, nightSurchargePerHour: fee, nightStartsAtMinutes: 1080, startMinutes, durationMinutes })

test('night surcharge is a flat fee, not prorated', () => {
  expect(flat(1080, 90, 20).surcharge).toBe(20) // padel 18:00 -> 19:30
  expect(flat(1065, 90, 20).surcharge).toBe(20) // 17:45 -> 19:15: reaches night, full flat fee
  expect(flat(1260, 60, 5).surcharge).toBe(5) // tennis 21:00
  expect(flat(1260, 60, 5).total).toBe(45)
  expect(flat(600, 90, 20).surcharge).toBe(0) // morning
  expect(flat(1020, 60, 20).surcharge).toBe(0) // 17:00 -> 18:00 ends at night start
  expect(flat(1080, 90, 0).surcharge).toBe(0) // no fee configured
})
