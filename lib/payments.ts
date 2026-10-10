import type { PaymentProvider } from '@/lib/types/database'

/**
 * How a booking is paid, and whether online payment is available.
 *
 * `online_full` pays the whole price now; `split` pays an equal share now and
 * invites the other players to pay theirs; `cash` is paid at the club (staff
 * confirm it there). Pure and shared by the checkout UI, the Server Actions and
 * the tests.
 *
 * No payment gateway account is connected yet (ClickToPay / Stripe), so online
 * payment runs against a SANDBOX provider ("test") that marks the payment paid
 * without moving money. The server refuses to do that in production unless
 * PAYMENTS_TEST_MODE=1, so a deployed site can never "pay" for free by accident;
 * there online and split are simply unavailable until a real provider is added.
 */
export const PAYMENT_CHOICES = ['online_full', 'split', 'cash'] as const
export type PaymentChoice = (typeof PAYMENT_CHOICES)[number]

/** Splitting is offered up to 4 players (padel, tennis); football's 12-14 players are cash or full. */
export const MAX_SPLIT_PLAYERS = 4

export type OnlineMode = 'test' | 'disabled'

export function onlinePaymentMode(env: { NODE_ENV?: string; PAYMENTS_TEST_MODE?: string } = process.env): OnlineMode {
  if (env.PAYMENTS_TEST_MODE === '1') return 'test'
  return env.NODE_ENV === 'production' ? 'disabled' : 'test'
}

/** The provider recorded for an online payment in the current mode. */
export function onlineProvider(mode: OnlineMode): PaymentProvider | null {
  return mode === 'test' ? 'test' : null
}

export function canSplit(playerCount: number): boolean {
  return playerCount >= 2 && playerCount <= MAX_SPLIT_PLAYERS
}

/**
 * Equal shares to the cent, the organizer absorbing the rounding: the same rule
 * as create_booking_shares() in the database, shown to the player beforehand.
 */
export function splitShares(total: number, count: number): { organizer: number; others: number } {
  const cents = Math.round(total * 100)
  const each = Math.floor(cents / count)
  return { others: each / 100, organizer: (cents - each * (count - 1)) / 100 }
}

export const CHOICE_LABEL: Record<PaymentChoice, string> = {
  online_full: 'Tout payer en ligne',
  split: 'Partager avec vos joueurs',
  cash: 'Payer sur place',
}

/** Site-relative link for a friend to pay their share. The client prefixes its origin. */
export const shareInvitePath = (token: string) => `/reservations/join?token=${token}`
export const SHARE_TOKEN_PATTERN = /^[0-9a-f]{48}$/

/** "90 TND" / "22.50 TND": whole amounts without decimals, otherwise two. */
export function formatTND(amount: number) {
  return `${Number.isInteger(amount) ? amount : amount.toFixed(2)} TND`
}
