/**
 * Links that go inside emails. Pure (no request or server imports) so they are unit-tested.
 *
 * A member's pass needs a signed-in session, so the link is just `/reservations/<id>`.
 * A guest has no account: their pass link carries the booking's secret (`?token=`), the
 * only proof they own it; without it the page answers 404 on purpose.
 */
export function bookingPassUrl(origin: string, bookingId: string, guestToken?: string | null): string {
  const base = `${origin.replace(/\/+$/, '')}/reservations/${bookingId}`
  return guestToken ? `${base}?token=${guestToken}` : base
}

/** A guest's secret link to cancel without an account. */
export function guestCancelUrl(origin: string, guestToken: string): string {
  return `${origin.replace(/\/+$/, '')}/reservations/cancel-guest?token=${guestToken}`
}
