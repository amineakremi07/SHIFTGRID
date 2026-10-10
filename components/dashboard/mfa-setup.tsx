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
    if (!normaliseTotp(code)) return setError('Enter the 6-digit code from your authenticator app.')
    setError(null)
    startTransition(async () => {
      const res = await verifyMFA(enrollment.factorId, code)
      if (!res.ok) return setError(res.message)
      setEnrollment(null)
      setNotice('Two-factor authentication is on. You will be asked for a code each time you sign in.')
      router.refresh()
    })
  }

  function remove(factorId: string) {
    setError(null)
    startTransition(async () => {
      const res = await disableMFA(factorId)
      if (!res.ok) return setError(res.message)
      setNotice('Two-factor authentication is off.')
      router.refresh()
    })
  }

  return (
    <section aria-labelledby="mfa-title" className="space-y-5">
      <div>
        <h2 id="mfa-title" className="text-lg font-semibold">
          Two-factor authentication
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Adds a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy) to your password, so a stolen password alone cannot open this account.
        </p>
      </div>

      {enrolled && !enrollment && (
        <div className="space-y-3">
          {factors.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="size-4 text-[#0e634f]" aria-hidden />
                {f.friendlyName ?? 'Authenticator app'} <span className="font-normal text-muted-foreground">· on</span>
              </p>
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => remove(f.id)}>
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldOff className="size-4" aria-hidden />}
                Turn off
              </Button>
            </div>
          ))}
        </div>
      )}

      {!enrolled && !enrollment && (
        <Button type="button" onClick={start} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Set up authenticator app
        </Button>
      )}

      {enrollment && (
        <form onSubmit={confirm} className="space-y-5 rounded-lg border p-5">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Open your authenticator app and add an account.</li>
            <li>Scan this QR code, or type the secret key below.</li>
            <li>Enter the 6-digit code the app shows.</li>
          </ol>
          <div className="ph-no-capture flex flex-wrap items-start gap-6">
            <div
              role="img"
              aria-label="QR code for your authenticator app"
              data-testid="mfa-qr"
              className="size-48 shrink-0 rounded-lg bg-white p-1 [&>svg]:size-full"
              dangerouslySetInnerHTML={{ __html: enrollment.svg }}
            />
            <div className="min-w-0 space-y-1">
              <Label htmlFor="mfa-secret">Can&apos;t scan? Enter this key</Label>
              <code id="mfa-secret" data-testid="mfa-secret" className="block break-all rounded bg-muted px-2 py-1 font-mono text-sm tracking-wider">
                {enrollment.secret}
              </code>
            </div>
          </div>
          <div className="max-w-xs space-y-2">
            <Label htmlFor="mfa-code">6-digit code</Label>
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
              Turn on
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setEnrollment(null)}>
              Cancel
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
