import * as React from 'react'
import Link from 'next/link'

import { CookieSettingsButton } from '@/components/consent/consent-banner'
import { LEGAL_UPDATED, LEGAL_VERSION } from '@/lib/legal'

/** Shared shell for /terms and /privacy: server-rendered; the only client piece is the cookie-settings button. */
export function LegalDocument({
  title,
  intro,
  toc,
  children,
}: {
  title: string
  intro: string
  toc: { id: string; title: string }[]
  children: React.ReactNode
}) {
  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="font-semibold text-foreground">
            ShiftGrid
          </Link>
          <nav aria-label="Legal" className="flex gap-5 text-sm text-muted-foreground">
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: {LEGAL_UPDATED} · Version {LEGAL_VERSION}
        </p>
        <p className="mt-6 text-base leading-relaxed text-foreground">{intro}</p>

        <nav aria-label="Contents" className="mt-8 rounded-lg bg-secondary p-4">
          <p className="text-sm font-medium text-foreground">Contents</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            {toc.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} className="text-foreground underline underline-offset-2 hover:text-primary">
                  {item.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">{children}</div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-3xl gap-6 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <Link href="/" className="hover:text-foreground">
            Back to ShiftGrid
          </Link>
          <CookieSettingsButton />
        </div>
      </footer>
    </>
  )
}

export function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-3">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  )
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-base leading-relaxed text-foreground">{children}</p>
}

export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-6 text-base leading-relaxed text-foreground">{children}</ul>
}
