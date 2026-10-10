'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { verifyMFA } from '@/lib/actions/mfa'
import { normaliseTotp } from '@/lib/mfa'

/** Step 2 of sign-in: the 6-digit code. `destination` was validated on the server (safeRedirectPath). */
export function MfaVerifyForm({ factorId, destination }: { factorId: string; destination: string }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!normaliseTotp(code)) return setError('Saisissez le code à 6 chiffres de votre application d\'authentification.')
    setError(null)
    startTransition(async () => {
      const res = await verifyMFA(factorId, code)
      if (!res.ok) return setError(res.message)
      // A full load, so the proxy sees the upgraded (aal2) session cookies.
      window.location.assign(destination)
    })
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="mfa-code">Code d&apos;authentification</Label>
          <Input
            id="mfa-code"
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="font-mono tracking-widest"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Vérifier
        </Button>
      </form>
      <form action="/logout" method="post" className="text-center">
        <button type="submit" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Se déconnecter
        </button>
      </form>
    </div>
  )
}
