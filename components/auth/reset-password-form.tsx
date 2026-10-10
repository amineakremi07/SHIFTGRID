'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import { AuthCard } from '@/components/auth/auth-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { newPasswordSchema } from '@/lib/validations/password-reset'

type Phase = 'checking' | 'ready' | 'invalid'

const INVALID =
  'Ce lien de réinitialisation est invalide ou a expiré. Ces liens ne fonctionnent qu\'une fois, pendant un court délai et (sauf si le modèle d\'e-mail a été modifié) dans le navigateur où vous les avez demandés.'

/**
 * Step 2: the page the emailed link opens. A recovery arrives in one of two ways and both are
 * handled:
 *  - `?code=...` (PKCE, the default): the browser client exchanges it for a session by itself,
 *    which needs the verifier stored by /forgot-password in THIS browser;
 *  - `?token_hash=...&type=recovery`: verified here with verifyOtp, so it also works when the
 *    link is opened on another device (needs the email template to link to this page).
 * The form appears only when a recovery really happened on this page load: an ordinary
 * signed-in visit to /reset-password gets "invalid link", not a password box.
 * On success the user is signed out everywhere and sent to log in with the new password.
 */
export function ResetPasswordForm() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return // the dev double-mount must not spend a one-time code twice
    started.current = true
    const supabase = createClient()
    const url = new URL(window.location.href)
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const get = (k: string) => url.searchParams.get(k) ?? hash.get(k)

    const urlError = get('error_description') ?? get('error_code') ?? get('error')
    const tokenHash = url.searchParams.get('token_hash')
    const hadCode = url.searchParams.has('code')
    let recovered = false

    // Not unsubscribed on purpose: the guard above means this effect body runs once per page load.
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        recovered = true
        setPhase('ready')
      }
    })

    void (async () => {
      if (urlError) {
        setPhase('invalid')
        return
      }
      if (tokenHash && url.searchParams.get('type') === 'recovery') {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        if (error) {
          setPhase('invalid')
        } else {
          recovered = true
          setPhase('ready')
        }
      } else {
        // Initialisation (and the ?code= exchange) finishes before getSession resolves.
        const { data } = await supabase.auth.getSession()
        setPhase(recovered || (hadCode && data.session) ? 'ready' : 'invalid')
      }
      // The one-time code or token has done its job: take it out of the address bar and history.
      window.history.replaceState(null, '', '/reset-password')
    })()
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    const parsed = newPasswordSchema.safeParse({ password, confirmPassword: confirm })
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors
      setErrors({ password: f.password?.[0], confirmPassword: f.confirmPassword?.[0] })
      return
    }
    setErrors({})
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
    if (error) {
      setBusy(false)
      const code = (error as { code?: string }).code
      setErrors({
        form:
          code === 'same_password'
            ? 'Votre nouveau mot de passe doit être différent de l\'ancien.'
            : code === 'weak_password'
              ? 'Ce mot de passe est trop faible ou a fuité lors d\'une violation de données. Veuillez en choisir un autre.'
              : error.status === 401 || error.status === 403
                ? 'Votre session de réinitialisation a expiré. Veuillez demander un nouveau lien.'
                : 'Impossible de modifier votre mot de passe. Veuillez réessayer.',
      })
      return
    }
    // End the recovery session (and any other session of this account): sign in again with the new password.
    await supabase.auth.signOut()
    router.push('/login?reset=1')
  }

  if (phase === 'checking') {
    return (
      <AuthCard title="Réinitialiser votre mot de passe">
        <p role="status" className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Vérification de votre lien…
        </p>
      </AuthCard>
    )
  }

  if (phase === 'invalid') {
    return (
      <AuthCard title="Lien non valide">
        <div role="alert" className="space-y-4 text-sm" data-testid="reset-invalid">
          <p>{INVALID}</p>
          <Button asChild className="w-full">
            <Link href="/forgot-password">Demander un nouveau lien</Link>
          </Button>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Choisissez un nouveau mot de passe" subtitle="Utilisez au moins 8 caractères.">
      <form onSubmit={submit} className="space-y-4" noValidate data-testid="reset-form">
        {errors.form && (
          <div role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {errors.form}
          </div>
        )}
        <div>
          <Label htmlFor="rp-password">Nouveau mot de passe</Label>
          <Input
            id="rp-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={Boolean(errors.password)}
            disabled={busy}
            autoFocus
          />
          {errors.password && <p className="mt-1 text-sm text-destructive">{errors.password}</p>}
        </div>
        <div>
          <Label htmlFor="rp-confirm">Confirmer le nouveau mot de passe</Label>
          <Input
            id="rp-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={Boolean(errors.confirmPassword)}
            disabled={busy}
          />
          {errors.confirmPassword && <p className="mt-1 text-sm text-destructive">{errors.confirmPassword}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Enregistrement" /> : 'Mettre à jour le mot de passe'}
        </Button>
      </form>
    </AuthCard>
  )
}
