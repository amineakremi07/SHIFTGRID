'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import { Loader2, ShieldCheck, ShieldOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { disableMFA, enrollMFA, verifyMFA, type MfaFactor } from '@/lib/actions/mfa'
import { normaliseTotp } from '@/lib/mfa'

type Enrollment = { factorId: string; secret: string; svg: string }

/**
 * Two-factor setup for the signed-in account: scan a QR code (or type the secret) into an authenticator
 * app, then confirm with a 6-digit code. Used by the club dashboard and the platform admin area.
 * The QR is drawn here from the `otpauth://` URI, so the secret is never sent to a third party.
 */
export function MfaSetup({ factors }: { factors: MfaFactor[] }) {
  const router = useRouter()
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const enrolled = factors.length > 0

  function start() {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const res = await enrollMFA()
      if (!res.ok) return setError(res.message)
      const svg = await QRCode.toString(res.uri, { type: 'svg', margin: 1, width: 192 })
      setEnrollment({ factorId: res.factorId, secret: res.secret, svg })
      setCode('')
    })
  }

  function confirm(e: React.FormEvent) {
    e.preventDefault()
    if (!enrollment) return
    if (!normaliseTotp(code)) return setError('Saisissez le code à 6 chiffres de votre application d\'authentification.')
    setError(null)
    startTransition(async () => {
      const res = await verifyMFA(enrollment.factorId, code)
      if (!res.ok) return setError(res.message)
      setEnrollment(null)
      setNotice('L\'authentification à deux facteurs est activée. Un code vous sera demandé à chaque connexion.')
      router.refresh()
    })
  }

  function remove(factorId: string) {
    setError(null)
    startTransition(async () => {
      const res = await disableMFA(factorId)
      if (!res.ok) return setError(res.message)
      setNotice('L\'authentification à deux facteurs est désactivée.')
      router.refresh()
    })
  }

  return (
    <section aria-labelledby="mfa-title" className="space-y-5">
      <div>
        <h2 id="mfa-title" className="text-lg font-semibold">
          Authentification à deux facteurs
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ajoute un code à 6 chiffres issu d&apos;une application d&apos;authentification (Google Authenticator, Microsoft Authenticator, 1Password, Authy) à votre mot de passe : un mot de passe volé ne suffit plus à ouvrir ce compte.
        </p>
      </div>

      {enrolled && !enrollment && (
        <div className="space-y-3">
          {factors.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="size-4 text-[#0e634f]" aria-hidden />
                {f.friendlyName ?? 'Application d\'authentification'} <span className="font-normal text-muted-foreground">· activée</span>
              </p>
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => remove(f.id)}>
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldOff className="size-4" aria-hidden />}
                Désactiver
              </Button>
            </div>
          ))}
        </div>
      )}

      {!enrolled && !enrollment && (
        <Button type="button" onClick={start} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Configurer l&apos;application d&apos;authentification
        </Button>
      )}

      {enrollment && (
        <form onSubmit={confirm} className="space-y-5 rounded-lg border p-5">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Ouvrez votre application d&apos;authentification et ajoutez un compte.</li>
            <li>Scannez ce QR code, ou saisissez la clé secrète ci-dessous.</li>
            <li>Saisissez le code à 6 chiffres affiché par l&apos;application.</li>
          </ol>
          <div className="ph-no-capture flex flex-wrap items-start gap-6">
            <div
              role="img"
              aria-label="QR code pour votre application d'authentification"
              data-testid="mfa-qr"
              className="size-48 shrink-0 rounded-lg bg-white p-1 [&>svg]:size-full"
              dangerouslySetInnerHTML={{ __html: enrollment.svg }}
            />
            <div className="min-w-0 space-y-1">
              <Label htmlFor="mfa-secret">Impossible de scanner ? Saisissez cette clé</Label>
              <code id="mfa-secret" data-testid="mfa-secret" className="block break-all rounded bg-muted px-2 py-1 font-mono text-sm tracking-wider">
                {enrollment.secret}
              </code>
            </div>
          </div>
          <div className="max-w-xs space-y-2">
            <Label htmlFor="mfa-code">Code à 6 chiffres</Label>
            <Input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="font-mono tracking-widest"
            />
          </div>
          <div className="flex gap-3">
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Activer
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setEnrollment(null)}>
              Annuler
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-[#0e634f]">
          {notice}
        </p>
      )}
    </section>
  )
}
