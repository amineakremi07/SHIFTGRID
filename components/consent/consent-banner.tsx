'use client'

import * as React from 'react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  getConsent,
  makeConsent,
  openConsentSettings,
  setConsent,
  subscribeConsent,
  subscribeOpenSettings,
  TRACKING_CONFIGURED,
} from '@/lib/consent'

/**
 * Consent banner for the two optional purposes (lib/consent.ts). Rendered only in the
 * browser (server snapshot is null), only when tracking is configured in this build, and
 * only until the visitor chooses, or when "Cookie settings" re-opens it.
 * Accept and Reject carry equal weight; nothing optional runs before a choice.
 */
export function ConsentBanner() {
  const consent = React.useSyncExternalStore(subscribeConsent, getConsent, () => undefined)
  const [customizing, setCustomizing] = React.useState(false)

  React.useEffect(() => subscribeOpenSettings(() => setCustomizing(true)), [])

  // undefined = server / before hydration; null = no choice stored yet.
  if (!TRACKING_CONFIGURED || consent === undefined) return null

  const choose = (analytics: boolean, replay: boolean) => {
    setConsent(makeConsent(analytics, replay))
    setCustomizing(false)
  }

  return (
    <>
      {consent === null && !customizing && (
        <section
          role="region"
          aria-label="Choix de confidentialité"
          className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card px-4 py-4 sm:px-6"
        >
          <div className="mx-auto flex max-w-[1200px] flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <p className="max-w-3xl text-sm leading-relaxed text-foreground">
              Nous utilisons des mesures d&apos;audience facultatives pour comprendre l&apos;usage de ShiftGrid et
              l&apos;améliorer, et, uniquement si vous l&apos;autorisez, des enregistrements de session dont tous les
              textes et saisies sont masqués. La réservation fonctionne de la même façon quel que soit votre choix.
              Consultez notre{' '}
              <Link href="/privacy#cookies" className="underline underline-offset-2 hover:text-primary">
                politique de confidentialité
              </Link>
              .
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="ghost" className="h-10" onClick={() => setCustomizing(true)}>
                Personnaliser
              </Button>
              <Button variant="outline" className="h-10 min-w-28" onClick={() => choose(false, false)}>
                Tout refuser
              </Button>
              <Button variant="outline" className="h-10 min-w-28" onClick={() => choose(true, true)}>
                Tout accepter
              </Button>
            </div>
          </div>
        </section>
      )}

      <ConsentDialog
        // Re-mount on open so the boxes start from the stored choice.
        key={customizing ? 'open' : 'closed'}
        open={customizing}
        initial={consent}
        onCancel={() => setCustomizing(false)}
        onSave={choose}
      />
    </>
  )
}

function ConsentDialog({
  open,
  initial,
  onCancel,
  onSave,
}: {
  open: boolean
  initial: { analytics: boolean; replay: boolean } | null
  onCancel: () => void
  onSave: (analytics: boolean, replay: boolean) => void
}) {
  const [analytics, setAnalytics] = React.useState(initial?.analytics ?? false)
  const [replay, setReplay] = React.useState(initial?.replay ?? false)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choix de confidentialité</DialogTitle>
          <DialogDescription>
            Les cookies strictement nécessaires (connexion et sécurité) sont toujours actifs. Le reste dépend de vous, et
            vous pouvez changer d&apos;avis à tout moment via « Paramètres des cookies ».
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Choice
            id="consent-analytics"
            label="Mesure d'audience"
            description="Pages vues de façon anonyme, pour savoir quelles pages sont utilisées. Les liens n'incluent jamais leur partie secrète."
            checked={analytics}
            onChange={(v) => {
              setAnalytics(v)
              if (!v) setReplay(false)
            }}
          />
          <Choice
            id="consent-replay"
            label="Enregistrements de session"
            description="Enregistrements de l'utilisation des pages, avec tous les textes et saisies masqués. Jamais sur les pages de connexion, de réservation, de lien de paiement ou du tableau de bord du club. Nécessite la mesure d'audience."
            checked={replay}
            disabled={!analytics}
            onChange={setReplay}
          />
          <p className="text-sm text-muted-foreground">
            Prestataire : PostHog. Détails dans notre{' '}
            <Link href="/privacy#cookies" className="underline underline-offset-2 hover:text-primary">
              politique de confidentialité
            </Link>
            .
          </p>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => onSave(false, false)}>
            Tout refuser
          </Button>
          <Button onClick={() => onSave(analytics, replay)}>Enregistrer mes choix</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Choice({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-secondary p-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={`${id}-desc`}
        className="mt-0.5 size-4 shrink-0 accent-primary disabled:opacity-50"
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        <p id={`${id}-desc`} className="text-sm text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  )
}

/** "Paramètres des cookies" link-style button for footers and the privacy page. */
export function CookieSettingsButton({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  if (!TRACKING_CONFIGURED) return null
  return (
    <button
      type="button"
      onClick={openConsentSettings}
      className={className ?? 'hover:text-foreground'}
    >
      {children ?? 'Paramètres des cookies'}
    </button>
  )
}
