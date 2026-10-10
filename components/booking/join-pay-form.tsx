'use client'

import * as React from 'react'
import { Check, FlaskConical, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { payShareAction } from '@/lib/actions/payments'
import { formatTND, type OnlineMode } from '@/lib/payments'

/** Pays one share of a split booking through its invite link. */
export function JoinPayForm({ token, amount, onlineMode }: { token: string; amount: number; onlineMode: OnlineMode }) {
  const [name, setName] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<{ confirmed: boolean } | null>(null)

  const pay = async () => {
    setBusy(true)
    setError(null)
    const res = await payShareAction({ token, payerName: name || undefined })
    setBusy(false)
    if (!res.ok) return setError(res.message)
    setDone({ confirmed: res.confirmed })
  }

  if (done) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-4 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
          <Check className="size-6" aria-hidden />
        </span>
        <h2 className="text-lg font-semibold">Votre part est payée</h2>
        <p className="text-sm text-muted-foreground">
          {done.confirmed
            ? 'Tout le monde a payé : la réservation est confirmée. À bientôt sur le terrain !'
            : 'La réservation est confirmée dès que chaque joueur a payé. À bientôt sur le terrain !'}
        </p>
      </div>
    )
  }

  if (onlineMode === 'disabled') {
    return (
      <p role="alert" className="rounded-lg bg-accent p-3 text-sm text-accent-foreground">
        Le paiement en ligne n&apos;est pas encore disponible. Veuillez payer directement l&apos;organisateur ou le club.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="payer-name">Votre nom (facultatif)</Label>
        <Input id="payer-name" autoComplete="name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
      </div>
      {onlineMode === 'test' && (
        <p className="flex items-start gap-2 rounded-lg bg-accent p-3 text-xs text-accent-foreground">
          <FlaskConical className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            <strong>Mode test :</strong> aucune passerelle de paiement réelle n&apos;est connectée, aucun argent n&apos;est débité.
          </span>
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button className="h-11 w-full" onClick={pay} disabled={busy}>
        {busy && <Loader2 className="animate-spin" aria-hidden />}
        Payer {formatTND(amount)}
      </Button>
    </div>
  )
}
