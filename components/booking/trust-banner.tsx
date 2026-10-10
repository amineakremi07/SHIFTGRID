import { AlertTriangle, ShieldAlert } from 'lucide-react'

import { formatVenueDate, venueDateString } from '@/lib/court-time'

/**
 * Shown on a member's own reservations page once no-shows start to count:
 * a warning from the second one, a suspension notice while one is active.
 * (The third no-show suspends booking for 30 days; the database enforces it.)
 */
export function TrustBanner({
  noShowCount,
  trustScore,
  suspendedUntil,
  now,
}: {
  noShowCount: number
  trustScore: number
  /** Present while a suspension is recorded; ignored once it has passed. */
  suspendedUntil: string | null
  /** The request time in ms, passed in so the render stays pure. */
  now: number
}) {
  const suspended = suspendedUntil !== null && Date.parse(suspendedUntil) > now
  if (!suspended && noShowCount < 2) return null

  if (suspended) {
    return (
      <div role="alert" className="mb-8 flex gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm" data-testid="suspension-banner">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        <div>
          <p className="font-semibold text-destructive">Réservation suspendue jusqu&apos;au {formatVenueDate(venueDateString(new Date(suspendedUntil)))}</p>
          <p className="mt-1">
            Vous avez manqué {noShowCount} réservations sans annuler : votre compte ne peut plus effectuer de nouvelles réservations pendant 30 jours. Les réservations existantes ne sont pas affectées.
            Votre score de confiance est de {trustScore}/100.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div role="status" className="mb-8 flex gap-3 rounded-xl border border-[#d9a400]/50 bg-[#d9a400]/10 p-4 text-sm" data-testid="no-show-warning">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[#8a6a00]" aria-hidden />
      <div>
        <p className="font-semibold">Votre compte compte {noShowCount} absences</p>
        <p className="mt-1">
          Votre score de confiance est de {trustScore}/100. Une absence de plus suspend votre compte des réservations pendant 30 jours. Si vous ne pouvez pas venir, annulez à temps afin
          qu&apos;un autre joueur puisse jouer.
        </p>
      </div>
    </div>
  )
}
