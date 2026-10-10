'use client'

import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

export const CHECKOUT_STEPS = [
  { n: 1, label: 'Créneau' },
  { n: 2, label: 'Paiement' },
  { n: 3, label: 'Confirmation' },
] as const

export type CheckoutStep = 1 | 2 | 3

/**
 * The breadcrumb / progress map of the booking drawer. Steps already reached (`maxStep`) are buttons:
 * going back or forward between them keeps everything the player entered, because the state lives in
 * the drawer body, not in the steps.
 */
export function CheckoutStepper({
  step,
  maxStep,
  onStep,
  disabled = false,
}: {
  step: CheckoutStep
  maxStep: CheckoutStep
  onStep: (step: CheckoutStep) => void
  disabled?: boolean
}) {
  return (
    <nav aria-label="Étapes de la réservation" className="px-4 pb-4">
      <ol className="flex items-center gap-2">
        {CHECKOUT_STEPS.map(({ n, label }, i) => {
          const done = n < step
          const reachable = n <= maxStep && !disabled
          return (
            <li key={n} className="flex min-w-0 flex-1 items-center gap-2">
              <button
                type="button"
                disabled={!reachable}
                aria-current={n === step ? 'step' : undefined}
                aria-label={`Étape ${n} : ${label}${done ? ' (terminée)' : ''}`}
                data-testid={`step-${n}`}
                onClick={() => onStep(n)}
                className={cn(
                  'flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-lg border px-2 text-left text-sm transition-colors md:min-h-10',
                  'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                  n === step && 'border-forest-depths bg-card font-semibold',
                  n !== step && reachable && 'border-border hover:bg-card/60',
                  !reachable && 'cursor-not-allowed border-transparent text-muted-foreground opacity-60'
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                    n === step ? 'bg-forest-depths text-bone-linen' : done ? 'bg-success text-white' : 'bg-secondary text-muted-foreground'
                  )}
                >
                  {done ? <Check className="size-3.5" /> : n}
                </span>
                <span className="truncate">{label}</span>
              </button>
              {i < CHECKOUT_STEPS.length - 1 && <span aria-hidden className="h-px w-3 shrink-0 bg-border" />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
