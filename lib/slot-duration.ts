export const SPORT_DURATION_MIN = {
  tennis: 60,
  padel: 90,
  football: 90,
} as const

export const BUFFER_MIN = 15

/** Legal player counts per sport (mirrors the bookings.valid_player_count CHECK). */
export const PLAYER_COUNT_OPTIONS = {
  padel: [4],
  tennis: [2, 4],
  football: [12, 14],
} as const

export type Sport = keyof typeof SPORT_DURATION_MIN

// Slot generation lives in `lib/court-slots.ts`. (An earlier hourly generator was
// removed: it ignored the sport's real cadence and produced naive local times.)
