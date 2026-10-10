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
    toast.success('Your account was deleted. Your personal data has been erased.')
    router.push('/')
    router.refresh()
  }

  return (
    <section aria-labelledby="delete-account-heading" className="mt-14 rounded-xl border border-destructive/30 p-5" data-testid="delete-account">
      <h2 id="delete-account-heading" className="text-base font-semibold">
        Delete my account
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Erase your personal data from ShiftGrid. This cannot be undone.
      </p>
      <Button variant="outline" size="sm" className="mt-3 border-destructive/40 text-destructive" onClick={() => reset(true)}>
        <Trash2 aria-hidden /> Delete my account
      </Button>

      <Dialog open={open} onOpenChange={(o) => !busy && reset(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>You are asking us to erase your personal data. Please read what happens:</DialogDescription>
          </DialogHeader>

          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            <li>
              <strong>Erased:</strong> your name, phone number and email, your login and password, and any notes or notification addresses tied to your bookings.
            </li>
            <li>
              <strong>Kept, anonymously:</strong> your past bookings, so the clubs&apos; accounting stays correct, and your no-show count and trust score, as anonymous statistics (your name becomes &ldquo;Joueur Anonyme&rdquo;).
            </li>
            <li>
              <strong>Cancelled:</strong>{' '}
              {upcomingCount > 0
                ? `your ${upcomingCount} upcoming booking${upcomingCount === 1 ? '' : 's'}, so the slot${upcomingCount === 1 ? ' is' : 's are'} released.`
                : 'any upcoming booking (you have none right now).'}
            </li>
            <li>You will be signed out everywhere and cannot recover the account.</li>
          </ul>

          <form onSubmit={submit} className="grid gap-3" noValidate>
            {error && (
              <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-sm text-destructive" data-testid="delete-error">
                {error}
              </p>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="del-password">Your password</Label>
              <Input id="del-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="del-confirm">
                Type <strong>DELETE</strong> to confirm
              </Label>
              <Input id="del-confirm" autoComplete="off" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} disabled={busy} />
            </div>
            <DialogFooter className="gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={() => reset(false)} disabled={busy}>
                Keep my account
              </Button>
              <Button type="submit" variant="destructive" disabled={busy || password === '' || confirmation !== 'DELETE'}>
                {busy && <Loader2 className="animate-spin" aria-hidden />}
                Delete my account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
