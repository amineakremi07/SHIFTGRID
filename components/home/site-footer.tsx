'use client'

import Link from 'next/link'

import { useAuthNav } from '@/hooks/use-auth-nav'
import { CookieSettingsButton } from '@/components/consent/consent-banner'
import { t } from '@/lib/i18n/messages'
import { scrollToSection } from '@/lib/scroll'

/**
 * Landing footer. The right padding keeps the links clear of the floating scroll-to-top button
 * (bottom-right); on phones the bottom padding also clears the floating bottom nav.
 */
export function SiteFooter() {
  // Prospective club owners are signed-out visitors: a signed-in account (player or club) has no use for it.
  const auth = useAuthNav()
  return (
    <footer className="border-t border-border/40">
      <div className="mx-auto flex max-w-[1920px] flex-wrap items-center justify-between gap-4 px-4 pb-28 pt-6 pr-14 text-sm text-muted-foreground sm:px-6 sm:pr-20 md:py-8 md:pr-24 lg:px-8 lg:pr-28 xl:px-12 xl:pr-32">
        <p>{t('footer.tagline')}</p>
        <nav aria-label={t('footer.nav')} className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-x-6">
          <Link
            href="/#discover"
            className="hover:text-foreground"
            onClick={(e) => {
              if (scrollToSection('discover')) e.preventDefault()
            }}
          >
            {t('footer.clubs')}
          </Link>
          {auth.status === 'signed_out' && (
            <Link href="/register?role=owner" className="hover:text-foreground">
              {t('footer.list')}
            </Link>
          )}
          <Link href="/terms" className="hover:text-foreground">
            {t('footer.terms')}
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            {t('footer.privacy')}
          </Link>
          <CookieSettingsButton>{t('footer.cookies')}</CookieSettingsButton>
        </nav>
      </div>
    </footer>
  )
}
