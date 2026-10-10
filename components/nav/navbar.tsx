'use client'

import * as React from 'react'
import Link from 'next/link'
import { LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { House, ListChecks, MapPin, Menu, UserRound } from 'lucide-react'

import { BrandMark } from '@/components/brand/brand-mark'
import { Button } from '@/components/ui/button'
import { SPRING } from '@/components/ui/motion-button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { homeLinkFor, useAuthNav, type AuthNav } from '@/hooks/use-auth-nav'
import { useActiveSection } from '@/hooks/use-active-section'
import { t, type MessageKey } from '@/lib/i18n/messages'
import { hashTarget, scrollToSection, type SectionId } from '@/lib/scroll'
import { cn } from '@/lib/utils'

/**
 * Public site navigation: a fixed header (logo left, Connexion / S'inscrire right) with a frosted-glass
 * pill holding only the section links. It is bare over the hero and gains a dark backing once the page
 * scrolls (so it stays legible over light sections), plus a floating bottom bar on phones.
 *
 * Section links scroll explicitly (`SectionLink`) instead of relying on the
 * browser's hash handling, which does nothing when the URL already has that hash.
 * The active link follows the scroll position (`useActiveSection`).
 *
 * Prefetching: the static targets (Login, Register) are marked `prefetch`. The
 * signed-in link ("My reservations" / the dashboard) is deliberately left on the
 * default: it is a dynamic, personal page, and `prefetch={true}` would cache its
 * data for minutes, so a booking made just before clicking would be missing.
 *
 * There is deliberately no `Pricing` link: prices are per club and per court,
 * shown on each club card.
 */
export const NAV_LINKS: readonly {
  id: SectionId
  href: string
  labelKey: MessageKey
  icon: typeof House
}[] = [
  { id: 'home', href: '/#home', labelKey: 'nav.home', icon: House },
  { id: 'discover', href: '/#discover', labelKey: 'nav.clubs', icon: MapPin },
  { id: 'how-it-works', href: '/#how-it-works', labelKey: 'nav.how', icon: ListChecks },
]

/**
 * A link to a section of this page. On the landing page it scrolls (smoothly,
 * every time); anywhere else it is an ordinary navigation to `/#section`.
 * `onNavigate` lets a menu close first, then the scroll runs once it has gone.
 */
function SectionLink({
  href,
  onNavigate,
  onClick,
  ...props
}: Omit<React.ComponentProps<typeof Link>, 'href'> & {
  href: string
  onNavigate?: () => void
}) {
  return (
    <Link
      href={href}
      {...props}
      onClick={(event) => {
        onClick?.(event)
        const id = hashTarget(href)
        if (event.defaultPrevented || !id || !document.getElementById(id)) return
        event.preventDefault()
        if (onNavigate) {
          onNavigate()
          window.setTimeout(() => scrollToSection(id), 220)
        } else {
          scrollToSection(id)
        }
      }}
    />
  )
}

export function Navbar() {
  const reduce = useReducedMotion()
  const auth = useAuthNav()
  const active = useActiveSection()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [scrolled, setScrolled] = React.useState(false)

  React.useEffect(() => {
    const update = () => setScrolled(window.scrollY > 40)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  const me = auth.status === 'signed_in' ? homeLinkFor(auth.role) : null
  const meLabel = me ? t(MY_LINK_KEY[me.label] ?? 'nav.myReservations') : null
  const logoTarget: SectionId =
    auth.status === 'signed_in' && auth.role === 'player' ? 'discover' : 'home'

  return (
    <>
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 pt-9 text-bone-linen transition-[background-color,padding,backdrop-filter] duration-300',
          // Over the dark hero the header is bare; once the page moves under it, it gets a backing so the
          // logo and buttons stay legible on the light sections.
          scrolled && 'bg-forest-depths/90 pb-3 pt-3 shadow-lg shadow-black/10 backdrop-blur-xl'
        )}
      >
        <div className="mx-auto grid max-w-[1920px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-8 sm:px-10 md:px-[3.75rem] xl:px-[4.75rem]">
          <SectionLink
            href={`/#${logoTarget}`}
            aria-label="ShiftGrid"
            className="inline-flex shrink-0 items-center justify-self-start"
          >
            <BrandMark tone="light" asStatic />
          </SectionLink>

          {/* The glass pill holds only the section links. */}
          <nav
            aria-label={t('nav.primary')}
            className="hidden items-center gap-1 rounded-full border border-white/20 bg-white/10 p-1 shadow-lg shadow-black/20 backdrop-blur-xl md:flex"
          >
            <LayoutGroup id="desktop-nav">
              {NAV_LINKS.map((link) => {
                const isActive = active === link.id
                return (
                  <SectionLink
                    key={link.id}
                    href={link.href}
                    prefetch
                    aria-current={isActive ? 'location' : undefined}
                    className={cn(
                      'relative rounded-full px-4 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
                      isActive ? 'text-bone-linen' : 'text-bone-linen/85 hover:text-bone-linen'
                    )}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="nav-pill"
                        transition={reduce ? { duration: 0 } : SPRING}
                        className="absolute inset-0 -z-10 rounded-full bg-white/10"
                      />
                    )}
                    {t(link.labelKey)}
                  </SectionLink>
                )
              })}
              {me && meLabel && (
                <Link
                  href={me.href}
                  className="rounded-full px-4 py-1.5 text-sm font-medium text-bone-linen transition-colors hover:bg-white/10"
                >
                  {meLabel}
                </Link>
              )}
            </LayoutGroup>
          </nav>
          <span className="md:hidden" aria-hidden />

          {/* ---------------------------- right-hand side ---------------------------- */}
          <div className="flex items-center justify-self-end gap-1">
            <div className="hidden min-w-[9.5rem] items-center justify-end gap-2 md:flex">
              <AuthActions auth={auth} />
            </div>

            {/* Mobile menu */}
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10 rounded-full text-bone-linen hover:bg-white/10 hover:text-bone-linen md:hidden"
                  aria-label={t('nav.openMenu')}
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="right">
                <SheetHeader>
                  <SheetTitle>{t('nav.menu')}</SheetTitle>
                </SheetHeader>
                <nav aria-label={t('nav.primary')} className="flex flex-col gap-1 px-4">
                  {NAV_LINKS.map((link) => (
                    <SectionLink
                      key={link.id}
                      href={link.href}
                      onNavigate={() => setMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-3 text-base font-medium transition-colors',
                        active === link.id ? 'bg-card' : 'hover:bg-muted'
                      )}
                    >
                      <link.icon className="size-5 text-muted-foreground" aria-hidden />
                      {t(link.labelKey)}
                    </SectionLink>
                  ))}
                </nav>
                <div className="mt-4 flex flex-col gap-2 px-4">
                  {auth.status === 'signed_in' && me && meLabel ? (
                    <>
                      <SheetClose asChild>
                        <Button asChild className="h-11">
                          <Link href={me.href}>{meLabel}</Link>
                        </Button>
                      </SheetClose>
                      <form action="/logout" method="post">
                        <Button type="submit" variant="outline" className="h-11 w-full">
                          {t('nav.signOut')}
                        </Button>
                      </form>
                    </>
                  ) : auth.status === 'signed_out' ? (
                    <>
                      <SheetClose asChild>
                        <Button asChild variant="outline" className="h-11">
                          <Link href="/login" prefetch>{t('nav.login')}</Link>
                        </Button>
                      </SheetClose>
                      <SheetClose asChild>
                        <Button asChild className="h-11">
                          <Link href="/register" prefetch>{t('nav.register')}</Link>
                        </Button>
                      </SheetClose>
                    </>
                  ) : null}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <MobileBottomNav active={active} auth={auth} me={me} meLabel={meLabel} />
    </>
  )
}

/** `homeLinkFor` labels (English, role-based) mapped to translation keys. */
const MY_LINK_KEY: Record<string, MessageKey> = {
  'My reservations': 'nav.myReservations',
  Dashboard: 'nav.dashboard',
  Admin: 'nav.admin',
}

/**
 * Right-hand side of the desktop header: signed-out visitors get the signup/login
 * call to action, signed-in users a sign-out button (their main link sits in the
 * nav). While the session is unknown nothing is drawn, so neither group flashes.
 */
function AuthActions({ auth }: { auth: AuthNav }) {
  if (auth.status === 'loading') return null

  if (auth.status === 'signed_in') {
    return (
      <form action="/logout" method="post">
        <Button
          type="submit"
          variant="outline"
          className="h-10 rounded-full border-white/30 bg-transparent px-5 text-bone-linen hover:bg-white/10 hover:text-bone-linen"
        >
          {t('nav.signOut')}
        </Button>
      </form>
    )
  }

  return (
    <>
      <Button
        asChild
        variant="ghost"
        className="h-10 rounded-full px-4 text-sm text-bone-linen hover:bg-transparent hover:text-bone-linen/80"
      >
        <Link href="/login" prefetch>{t('nav.login')}</Link>
      </Button>
      {/* Outlined, not green: the hero CTA is this view's one Lime Pulse. */}
      <Button
        asChild
        variant="outline"
        className="h-10 rounded-full border-white/30 bg-transparent px-5 text-sm text-bone-linen hover:bg-white/10 hover:text-bone-linen"
      >
        <Link href="/register" prefetch>{t('nav.register')}</Link>
      </Button>
    </>
  )
}

/**
 * Floating bottom bar for phones: three section shortcuts plus the account. Big
 * touch targets (≥ 48px), a sliding active pill and a small press-down spring so
 * taps feel physical.
 */
function MobileBottomNav({
  active,
  auth,
  me,
  meLabel,
}: {
  active: SectionId
  auth: AuthNav
  me: { label: string; href: string } | null
  meLabel: string | null
}) {
  const reduce = useReducedMotion()

  const accountHref = me?.href ?? '/login'
  const accountLabel = meLabel ?? t(auth.status === 'signed_in' ? 'nav.account' : 'nav.login')

  return (
    <nav
      aria-label={t('nav.sections')}
      className="fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-white/20 bg-forest-depths/85 p-1 text-bone-linen shadow-lg shadow-black/20 backdrop-blur-xl md:hidden"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <LayoutGroup id="mobile-nav">
        <ul className="grid grid-cols-4">
          {NAV_LINKS.map((link) => {
            const isActive = active === link.id
            return (
              <li key={link.id}>
                <motion.div whileTap={reduce ? undefined : { scale: 0.9 }} transition={SPRING}>
                  <SectionLink
                    href={link.href}
                    aria-current={isActive ? 'location' : undefined}
                    className={cn(
                      'relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[0.68rem] font-medium leading-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                      isActive ? 'text-bone-linen' : 'text-bone-linen/85'
                    )}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="bottom-pill"
                        transition={reduce ? { duration: 0 } : SPRING}
                        className="absolute inset-0 -z-10 rounded-xl bg-white/15"
                      />
                    )}
                    <link.icon className="size-5" aria-hidden />
                    <span className="max-w-full truncate">
                      {t(link.id === 'how-it-works' ? 'nav.howShort' : link.labelKey)}
                    </span>
                  </SectionLink>
                </motion.div>
              </li>
            )
          })}
          <li>
            <motion.div whileTap={reduce ? undefined : { scale: 0.9 }} transition={SPRING}>
              <Link
                href={accountHref}
                className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[0.68rem] font-medium leading-tight text-bone-linen/85 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <UserRound className="size-5" aria-hidden />
                <span className="max-w-full truncate">{accountLabel}</span>
              </Link>
            </motion.div>
          </li>
        </ul>
      </LayoutGroup>
    </nav>
  )
}
