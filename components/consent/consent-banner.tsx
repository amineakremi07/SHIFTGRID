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
          aria-label="Privacy choices"
          className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card px-4 py-4 sm:px-6"
        >
          <div className="mx-auto flex max-w-[1200px] flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <p className="max-w-3xl text-sm leading-relaxed text-foreground">
              We use optional analytics to understand how ShiftGrid is used and improve it, and, only if you allow it,
              session recordings with all text and typing hidden. Booking works the same whatever you choose. See our{' '}
              <Link href="/privacy#cookies" className="underline underline-offset-2 hover:text-primary">
                Privacy Policy
              </Link>
              .
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="ghost" className="h-10" onClick={() => setCustomizing(true)}>
                Customize
              </Button>
              <Button variant="outline" className="h-10 min-w-28" onClick={() => choose(false, false)}>
                Reject all
              </Button>
              <Button variant="outline" className="h-10 min-w-28" onClick={() => choose(true, true)}>
                Accept all
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
          <DialogTitle>Privacy choices</DialogTitle>
          <DialogDescription>
            Strictly necessary cookies (keeping you signed in and secure) are always on. The rest is up to you, and you
            can change it any time from &ldquo;Cookie settings&rdquo;.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Choice
            id="consent-analytics"
            label="Usage analytics"
            description="Anonymous page views, so we can see which pages are used. Links never include their secret part."
            checked={analytics}
            onChange={(v) => {
              setAnalytics(v)
              if (!v) setReplay(false)
            }}
          />
          <Choice
            id="consent-replay"
            label="Session recordings"
            description="Recordings of how pages are used, with all text and everything you type hidden. Never on sign-in, reservation, payment-link or club dashboard pages. Requires usage analytics."
            checked={replay}
            disabled={!analytics}
            onChange={setReplay}
          />
          <p className="text-sm text-muted-foreground">
            Provider: PostHog. Details in our{' '}
            <Link href="/privacy#cookies" className="underline underline-offset-2 hover:text-primary">
              Privacy Policy
            </Link>
            .
          </p>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => onSave(false, false)}>
            Reject all
          </Button>
          <Button onClick={() => onSave(analytics, replay)}>Save choices</Button>
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

/** "Cookie settings" link-style button for footers and the privacy page. */
export function CookieSettingsButton({ className }: { className?: string }) {
  if (!TRACKING_CONFIGURED) return null
  return (
    <button
      type="button"
      onClick={openConsentSettings}
      className={className ?? 'hover:text-foreground'}
    >
      Cookie settings
    </button>
  )
}
