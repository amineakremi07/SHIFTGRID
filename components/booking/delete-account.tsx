'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { deleteMyAccountAction } from '@/lib/actions/account-deletion'

/**
 * "Delete my account" on the player's own reservations page. Explains exactly what goes and what stays,
 * then asks for the password and a typed confirmation (the server checks both).
 */
export function DeleteAccount({ upcomingCount }: { upcomingCount: number }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [password, setPassword] = React.useState('')
  const [confirmation, setConfirmation] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const reset = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setPassword('')
      setConfirmation('')
      setError(null)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await deleteMyAccountAction({ password, confirmation })
    setBusy(false)
    if (!result.success) return void setError(result.error)
    toast.success('Votre compte a été supprimé. Vos données personnelles ont été effacées.')
    router.push('/')
    router.refresh()
  }

  return (
    <section aria-labelledby="delete-account-heading" className="mt-14 rounded-xl border border-destructive/30 p-5" data-testid="delete-account">
      <h2 id="delete-account-heading" className="text-base font-semibold">
        Supprimer mon compte
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Effacez vos données personnelles de ShiftGrid. Cette action est irréversible.
      </p>
      <Button variant="outline" size="sm" className="mt-3 border-destructive/40 text-destructive" onClick={() => reset(true)}>
        <Trash2 aria-hidden /> Supprimer mon compte
      </Button>

      <Dialog open={open} onOpenChange={(o) => !busy && reset(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Supprimer votre compte ?</DialogTitle>
            <DialogDescription>Vous nous demandez d&apos;effacer vos données personnelles. Voici ce qui se passe :</DialogDescription>
          </DialogHeader>

          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            <li>
              <strong>Effacés :</strong> votre nom, numéro de téléphone et e-mail, votre identifiant et mot de passe, ainsi que les notes ou adresses de notification liées à vos réservations.
            </li>
            <li>
              <strong>Conservés, de façon anonyme :</strong> vos réservations passées, afin que la comptabilité des clubs reste correcte, ainsi que votre nombre d&apos;absences et votre score de confiance, sous forme de statistiques anonymes (votre nom devient «&nbsp;Joueur Anonyme&nbsp;»).
            </li>
            <li>
              <strong>Annulées :</strong>{' '}
              {upcomingCount > 0
                ? `vos ${upcomingCount} réservation${upcomingCount === 1 ? '' : 's'} à venir, afin que ${upcomingCount === 1 ? 'le créneau soit libéré' : 'les créneaux soient libérés'}.`
                : 'toute réservation à venir (vous n\'en avez aucune pour le moment).'}
            </li>
            <li>Vous serez déconnecté partout et ne pourrez pas récupérer le compte.</li>
          </ul>

          <form onSubmit={submit} className="grid gap-3" noValidate>
            {error && (
              <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-sm text-destructive" data-testid="delete-error">
                {error}
              </p>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="del-password">Votre mot de passe</Label>
              <Input id="del-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="del-confirm">
                Saisissez <strong>DELETE</strong> pour confirmer
              </Label>
              <Input id="del-confirm" autoComplete="off" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} disabled={busy} />
            </div>
            <DialogFooter className="gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={() => reset(false)} disabled={busy}>
                Conserver mon compte
              </Button>
              <Button type="submit" variant="destructive" disabled={busy || password === '' || confirmation !== 'DELETE'}>
                {busy && <Loader2 className="animate-spin" aria-hidden />}
                Supprimer mon compte
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
