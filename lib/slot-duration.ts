export const SPORT_DURATION_MIN = {
  tennis: 60,
  padel: 90,
  football: 90,
} as const

export const BUFFER_MIN = 15

export type Sport = keyof typeof SPORT_DURATION_MIN

export function getSlotDuration(sport: Sport): number {
  return (SPORT_DURATION_MIN[sport] || 60) + BUFFER_MIN
}

export function generateSlotIntervals(
  sport: Sport,
  startHour: number, // 0-23
  endHour: number,   // 0-23
  dateStr: string // YYYY-MM-DD
): Array<{ start: string; end: string }> {
  const duration = getSlotDuration(sport)
  const slots = []
  for (let h = startHour; h < endHour; h++) {
    const start = `${dateStr}T${String(h).padStart(2, '0')}:00:00`
    const endHourCalc = h + Math.ceil(duration / 60)
    const end = `${dateStr}T${String(endHourCalc).padStart(2, '0')}:00:00`
    slots.push({ start, end })
  }
  return slots
}
