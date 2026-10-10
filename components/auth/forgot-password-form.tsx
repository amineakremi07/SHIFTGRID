'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Loader2 } from 'lucide-react'

import { AuthCard } from '@/components/auth/auth-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AUTH_PATHS } from '@/lib/auth-urls'
import { createClient } from '@/lib/supabase/client'
import { forgotPasswordSchema } from '@/lib/validations/password-reset'

/** Seconds before another email can be requested (Supabase rate-limits these too). */
const COOLDOWN_S = 60

/**
 * Step 1 of "I forgot my password": ask Supabase Auth to email a reset link that returns to
 * /reset-password on THIS origin (the PKCE verifier it stores in this browser is what lets
 * that page finish the exchange, so the redirect must come back to the same site).
 * The answer is the same whether or not the address has an account, so the form cannot
 * be used to find out who is registered.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => window.clearTimeout(id)
  }, [cooldown])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || cooldown > 0) return
    const parsed = forgotPasswordSchema.safeParse({ email })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }
    setError(null)
    setBusy(true)
    const { error: authError } = await createClient().auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${window.location.origin}${AUTH_PATHS.resetPassword}`, // must be on the Supabase Redirect URLs list (lib/auth-urls.ts)
    })
    setBusy(false)

    if (authError) {
      // Unknown addresses do not error, so what reaches here is a real problem, not a lookup.
      setError(
        authError.status === 429
          ? 'Trop de demandes. Veuillez patienter quelques minutes avant de réessayer.'
          : 'Impossible d\'envoyer l\'e-mail pour le moment. Veuillez réessayer dans quelques minutes.'
      )
      if (authError.status === 429) setCooldown(COOLDOWN_S)
      return
    }
    setSentTo(parsed.data.email)
    setCooldown(COOLDOWN_S)
  }

  return (
    <AuthCard title="Mot de passe oublié ?" subtitle="Saisissez votre adresse e-mail et nous vous enverrons un lien pour en choisir un nouveau.">
      {sentTo ? (
        <div role="status" className="space-y-4 text-sm" data-testid="reset-sent">
          <p className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#0e634f]" aria-hidden />
            <span>
              Si un compte existe pour <strong>{sentTo}</strong>, un lien de réinitialisation est en route. Il expire au bout
              d&apos;un court délai et ne fonctionne qu&apos;une fois. Vérifiez vos courriers indésirables si vous ne le voyez pas.
            </span>
          </p>
          <Button type="button" variant="outline" className="w-full" onClick={() => setSentTo(null)} disabled={cooldown > 0}>
            {cooldown > 0 ? `Renvoyer dans ${cooldown} s` : 'Envoyer un autre lien'}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && (
            <div role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div>
            <Label htmlFor="fp-email">E-mail</Label>
            <Input
              id="fp-email"
              type="email"
              autoComplete="email"
              placeholder="vous@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              autoFocus
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy || cooldown > 0}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Envoi en cours" /> : cooldown > 0 ? `Réessayer dans ${cooldown} s` : 'Envoyer le lien'}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Vous vous en souvenez ?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </AuthCard>
  )
}
