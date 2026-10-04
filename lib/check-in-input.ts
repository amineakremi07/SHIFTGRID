/**
 * What a receptionist types or a QR scanner reads, turned into one lookup key.
 * Pure (no server imports) so the dashboard modal and the API route share it.
 *
 *   "782910" / "shiftgrid:checkin:782910"   the 6-digit check-in code
 *   "3922DD5F" / "shiftgrid:booking:3922DD5F" the 8-character booking reference
 *   a full booking id (uuid)
 */
export type CheckInKey =
  | { kind: 'code'; code: string }
  | { kind: 'reference'; reference: string }
  | { kind: 'id'; bookingId: string }

const CODE = /^\d{6}$/
const REFERENCE = /^[0-9a-f]{8}$/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseCheckInInput(raw: string | null | undefined): CheckInKey | null {
  let value = (raw ?? '').trim()
  value = value.replace(/^shiftgrid:(checkin|booking):/i, '').replace(/\s+/g, '')
  if (CODE.test(value)) return { kind: 'code', code: value }
  if (UUID.test(value)) return { kind: 'id', bookingId: value.toLowerCase() }
  if (REFERENCE.test(value)) return { kind: 'reference', reference: value.toUpperCase() }
  return null
}

/** The QR payload printed on the pass and in the confirmation email. */
export const checkInQrPayload = (code: string) => `shiftgrid:checkin:${code}`
