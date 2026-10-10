'use client'

import * as React from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Building2, CalendarCheck } from 'lucide-react'

import { OwnerSignupForm } from '@/components/auth/owner-signup-form'
import { PlayerSignupForm, type RegisterClub } from '@/components/auth/player-signup-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SPRING } from '@/components/ui/motion-button'

/* ==========================================================================
   /register: choose a role first, then see only that role's form.
   Two flat Oat Milk cards on the Bone Linen canvas (DESIGN.md); the role
   lives in the URL (?role=) so the choice can be linked to and survives reloads.
   ========================================================================== */

export type RegisterRole = 'player' | 'owner'

function RoleCard({
  icon: Icon,
  eyebrow,
  title,
  description,
  cta,
  onSelect,
  animate,
}: {
  icon: typeof CalendarCheck
  eyebrow: string
  title: string
  description: string
  cta: string
  onSelect: () => void
  animate: boolean
}) {
  const descId = React.useId()

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      aria-describedby={descId}
      whileHover={animate ? { y: -2 } : undefined}
      whileTap={animate ? { scale: 0.99 } : undefined}
      transition={SPRING}
      className="group flex flex-col items-start rounded-xl border border-transparent bg-card p-6 text-left outline-none transition-colors hover:border-forest-depths/30 focus-visible:ring-3 focus-visible:ring-ring/50 md:p-8"
    >
      <span className="flex size-11 items-center justify-center rounded-lg bg-background">
        <Icon className="size-5" aria-hidden />
      </span>

      <span className="mt-6 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {eyebrow}
      </span>
      <span className="mt-1 text-2xl font-semibold tracking-tight">{title}</span>
      <span id={descId} className="mt-2 max-w-[38ch] text-sm leading-relaxed text-muted-foreground">
        {description}
      </span>

      <span className="mt-8 flex items-center gap-2 text-sm font-medium">
        {cta}
        <ArrowRight
          className="size-4 transition-transform group-hover:translate-x-1"
          aria-hidden
        />
      </span>
    </motion.button>
  )
}

export function RegisterFlow({
  clubs,
  initialRole,
  initialClubId,
  next,
}: {
  clubs: RegisterClub[]
  initialRole: RegisterRole | null
  initialClubId: string | null
  /** Already validated with `safeRedirectPath`. */
  next: string | null
}) {
  const reduce = useReducedMotion()
  const animate = !reduce

  const [role, setRole] = React.useState<RegisterRole | null>(initialRole)

  // Move keyboard/screen-reader focus to the new view's heading after a switch
  // (but not on first load, which would steal focus from the page).
  const headingRef = React.useRef<HTMLHeadingElement>(null)
  // The owner wizard renders its own h1, so that view is focused at section level.
  const ownerSectionRef = React.useRef<HTMLElement>(null)
  const interacted = React.useRef(false)
  React.useEffect(() => {
    if (interacted.current) (headingRef.current ?? ownerSectionRef.current)?.focus()
  }, [role])

  const changeRole = (next: RegisterRole | null) => {
    interacted.current = true
    setRole(next)
    // Keep the URL in step so the choice is shareable and survives a reload,
    // preserving ?club= and ?next=.
    const url = new URL(window.location.href)
    if (next) url.searchParams.set('role', next)
    else url.searchParams.delete('role')
    window.history.replaceState(null, '', url)
  }

  const view = role ?? 'choice'

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={view}
        initial={animate ? { opacity: 0, y: 12 } : false}
        animate={{ opacity: 1, y: 0 }}
        exit={animate ? { opacity: 0, y: -8 } : undefined}
        transition={SPRING}
      >
        {role === null && (
          <section aria-labelledby="register-title">
            <h1
              id="register-title"
              ref={headingRef}
              tabIndex={-1}
              className="text-3xl font-semibold tracking-tight outline-none md:text-4xl"
            >
              Rejoindre ShiftGrid
            </h1>
            <p className="mt-2 max-w-[56ch] text-muted-foreground">
              Choisissez comment vous utiliserez ShiftGrid. Vous pouvez changer à tout moment avant de valider.
            </p>

            <div role="group" aria-label="Type de compte" className="mt-8 grid gap-4 md:grid-cols-2">
              <RoleCard
                icon={CalendarCheck}
                eyebrow="Je suis joueur"
                title="Réserver et jouer"
                description="Découvrez des terrains de padel, de tennis et de football près de chez vous et gérez vos réservations instantanées."
                cta="Créer un compte joueur"
                onSelect={() => changeRole('player')}
                animate={animate}
              />
              <RoleCard
                icon={Building2}
                eyebrow="Je possède un site / un club"
                title="Inscrire mon club"
                description="Gérez vos terrains, plannings, tarifs et équipe, et consultez vos statistiques."
                cta="Commencer l'inscription du club"
                onSelect={() => changeRole('owner')}
                animate={animate}
              />
            </div>
          </section>
        )}

        {role === 'player' && (
          <section aria-labelledby="register-title" className="mx-auto max-w-lg">
            <div className="mb-6 flex items-center justify-between gap-3">
              <Button variant="ghost" onClick={() => changeRole(null)} className="-ml-3">
                <ArrowLeft aria-hidden />
                Changer de rôle
              </Button>
              <Badge variant="secondary">Inscription en tant que joueur</Badge>
            </div>

            <h1
              id="register-title"
              ref={headingRef}
              tabIndex={-1}
              className="text-3xl font-semibold tracking-tight outline-none"
            >
              Créez votre compte joueur
            </h1>
            <p className="mb-6 mt-2 text-muted-foreground">
              Réservez des terrains en quelques clics et retrouvez vos réservations au même endroit.
            </p>

            <PlayerSignupForm clubs={clubs} initialClubId={initialClubId} next={next} />
          </section>
        )}

        {role === 'owner' && (
          <section
            aria-label="Inscription du club"
            ref={ownerSectionRef}
            tabIndex={-1}
            className="outline-none"
          >
            <div className="mb-6 flex items-center justify-between gap-3">
              <Button variant="ghost" onClick={() => changeRole(null)} className="-ml-3">
                <ArrowLeft aria-hidden />
                Changer de rôle
              </Button>
              <Badge variant="secondary">Inscription d&apos;un club</Badge>
            </div>

            {/* The existing multi-step B2B onboarding wizard (it renders the page's h1). */}
            <OwnerSignupForm />
          </section>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
