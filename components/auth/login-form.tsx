'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { z } from 'zod'

import { BrandMark } from '@/components/brand/brand-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { postLoginPath } from '@/lib/auth-landing'
import { createClient } from '@/lib/supabase/client'
import { GoogleButton } from '@/components/auth/google-button'

const loginSchema = z.object({
  email: z.string().email('Adresse e-mail invalide'),
  password: z.string().min(1, 'Le mot de passe est obligatoire'),
  rememberMe: z.boolean().default(false),
})
type LoginFormData = z.infer<typeof loginSchema>

export type LoginPortal = 'general' | 'business'

const COPY: Record<LoginPortal, { eyebrow?: string; title: string; placeholder: string }> = {
  general: {
    title: 'Connexion',
    placeholder: 'you@example.com',
  },
  business: {
    eyebrow: 'ShiftGrid Business',
    title: 'Connexion gestion de club',
    placeholder: 'owner@sportcity.tn',
  },
}

/** Supabase answers in English; translate the cases a visitor can actually hit. */
function frenchAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail ou mot de passe incorrect.'
  if (m.includes('email not confirmed')) return 'Votre adresse e-mail n\'est pas encore confirmée. Ouvrez le lien reçu par e-mail.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Trop de tentatives. Veuillez patienter un instant avant de réessayer.'
  return 'La connexion a échoué. Veuillez réessayer.'
}

function LoginFormContent({ portal }: { portal: LoginPortal }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // The route guards send `?redirect=`; older links used `?callbackUrl=` / `?next=`.
  // postLoginPath() only follows same-site paths the signed-in role can open.
  const requested = searchParams.get('redirect') ?? searchParams.get('callbackUrl') ?? searchParams.get('next')
  const copy = COPY[portal]
  const passwordWasReset = searchParams.get('reset') === '1'
  // /auth/callback sends a bad, expired or already used email link here.
  const linkProblem = searchParams.get('error') === 'link_invalid'
  // Google sign-in found no account and no club to join (the button on a club page knows the club).
  const googleNoClub = searchParams.get('error') === 'google_no_club'
  // Google would not vouch for the address, so nothing was signed in or linked.
  const googleUnverified = searchParams.get('error') === 'google_unverified'
  // /register just emailed a confirmation link.
  const justRegistered = searchParams.get('registered') === '1'

  const [error, setError] = useState<React.ReactNode>(null)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof loginSchema>, unknown, LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: false },
  })

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true)
    setError(null)
    const supabase = createClient()

    const fail = async (message: React.ReactNode) => {
      await supabase.auth.signOut()
      setError(message)
      setIsLoading(false)
    }

    const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })
    if (authError || !auth.user) {
      setError(authError ? frenchAuthError(authError.message) : 'La connexion a échoué. Veuillez réessayer.')
      setIsLoading(false)
      return
    }

    const { data: profile } = await supabase.from('profiles').select('role, org_id').eq('id', auth.user.id).maybeSingle()
    if (!profile) return fail('Aucun profil ShiftGrid n\'a été trouvé pour ce compte. Veuillez contacter le support.')

    // Club managers need an approved club; a pending or rejected one has nothing to manage yet.
    if (profile.role === 'org_admin' || profile.role === 'staff') {
      const { data: org } = await supabase.from('organizations').select('status, deleted_at').eq('id', profile.org_id).maybeSingle()
      if (org?.deleted_at) return fail('Ce club a été fermé. Veuillez contacter le support.')
      if (org?.status === 'pending') return fail('Votre organisation est en cours de vérification. Veuillez patienter jusqu\'à son approbation.')
      if (org?.status === 'rejected') return fail('L\'inscription de votre organisation a été refusée. Veuillez contacter le support.')
      if (org?.status !== 'approved') return fail('Votre organisation n\'est pas active. Veuillez contacter le support.')
    }

    if (portal === 'business' && profile.role === 'player') {
      return fail(
        <>
          Ce portail est réservé à la gestion des clubs. Veuillez vous connecter via la{' '}
          <Link href="/login" className="font-medium underline underline-offset-2">
            page de connexion principale
          </Link>
          .
        </>
      )
    }

    router.push(postLoginPath(profile.role, requested))
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark tone="dark" imageClassName="h-12" />
          {copy.eyebrow && (
            <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{copy.eyebrow}</p>
          )}
          <h1 className={`text-2xl font-semibold ${copy.eyebrow ? 'mt-1' : 'mt-6'}`}>{copy.title}</h1>
          <p className="text-muted-foreground mt-2">Bon retour ! Saisissez vos informations.</p>
        </div>

        <div className="bg-background border rounded-lg p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {linkProblem && !error && (
              <div role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive" data-testid="link-invalid">
                Ce lien e-mail est invalide, a expiré ou a déjà été utilisé. Connectez-vous ci-dessous, ou demandez un nouveau lien (une nouvelle invitation du propriétaire du club, ou{' '}
                <Link href="/forgot-password" className="font-medium underline underline-offset-2">
                  une réinitialisation du mot de passe
                </Link>
                ).
              </div>
            )}
            {googleNoClub && !error && (
              <div role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive" data-testid="google-no-club">
                Aucun compte ShiftGrid n&apos;utilise encore cette adresse Google. Ouvrez la page d&apos;un club et touchez <strong>Continuer avec Google</strong> pour rejoindre ce club, ou{' '}
                <Link href="/register" className="font-medium underline underline-offset-2">
                  créez un compte
                </Link>
                .
              </div>
            )}
            {googleUnverified && !error && (
              <div role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive" data-testid="google-unverified">
                Google n&apos;a pas pu confirmer cette adresse e-mail, nous ne vous avons donc pas connecté. Utilisez votre mot de passe, ou{' '}
                <Link href="/forgot-password" className="font-medium underline underline-offset-2">
                  réinitialisez-le
                </Link>
                .
              </div>
            )}
            {justRegistered && !error && (
              <div role="status" className="rounded-md border border-[#0e634f]/30 bg-[#0e634f]/10 p-3 text-sm text-[#0e634f]" data-testid="check-your-email">
                Presque terminé : nous vous avons envoyé un lien de confirmation. Ouvrez-le pour activer votre compte, puis connectez-vous ici.
              </div>
            )}
            {passwordWasReset && !error && (
              <div role="status" className="rounded-md border border-[#0e634f]/30 bg-[#0e634f]/10 p-3 text-sm text-[#0e634f]">
                Votre mot de passe a été mis à jour. Connectez-vous avec votre nouveau mot de passe.
              </div>
            )}
            {error && (
              <div role="alert" className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
                {error}
              </div>
            )}

            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder={copy.placeholder}
                {...register('email')}
                error={!!errors.email}
                disabled={isLoading}
              />
              {errors.email && <p className="text-sm text-destructive mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                {...register('password')}
                error={!!errors.password}
                disabled={isLoading}
              />
              {errors.password && <p className="text-sm text-destructive mt-1">{errors.password.message}</p>}
              <p className="mt-2 text-right">
                <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                  Mot de passe oublié ?
                </Link>
              </p>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="rememberMe"
                {...register('rememberMe')}
                className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                disabled={isLoading}
              />
              <Label htmlFor="rememberMe" className="ml-2 text-sm cursor-pointer">
                Se souvenir de moi pendant 30 jours
              </Label>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Connexion en cours" /> : 'Se connecter'}
            </Button>
          </form>

          {portal === 'general' && (
            <div className="mt-5 space-y-3">
              <p className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                ou
              </p>
              <GoogleButton next={requested ?? undefined} disabled={isLoading} />
              <p className="text-center text-xs text-muted-foreground">
                En continuant, vous acceptez les{' '}
                <Link href="/terms" className="underline underline-offset-2">conditions d&apos;utilisation</Link> et la{' '}
                <Link href="/privacy" className="underline underline-offset-2">politique de confidentialité</Link>.
              </p>
            </div>
          )}

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {portal === 'general' ? (
              <>
                <p>
                  Nouveau ici ?{' '}
                  <Link href="/register" className="text-primary hover:underline font-medium">
                    Créer un compte
                  </Link>
                </p>
                <p className="mt-2">
                  Vous gérez un club ?{' '}
                  <Link href="/login-owner" className="text-primary hover:underline font-medium">
                    Connexion gestion de club
                  </Link>
                </p>
              </>
            ) : (
              <>
                <p>
                  Pas encore d&apos;organisation ?{' '}
                  <Link href="/register?role=owner" className="text-primary hover:underline font-medium">
                    Inscrivez votre complexe sportif
                  </Link>
                </p>
                <p className="mt-2">
                  Vous êtes joueur ?{' '}
                  <Link href="/login" className="text-primary hover:underline font-medium">
                    Connectez-vous ici
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** `useSearchParams()` needs a Suspense boundary or the production build fails at prerender. */
export function LoginForm({ portal }: { portal: LoginPortal }) {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-muted-foreground">Chargement...</div>}>
      <LoginFormContent portal={portal} />
    </Suspense>
  )
}
