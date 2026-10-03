'use client'

import Link from 'next/link'
import { Menu } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { BrandMark } from '@/components/brand/brand-mark'
import { homeLinkFor, useAuthNav, type AuthNav } from '@/hooks/use-auth-nav'

/**
 * Public site navigation, rendered on the dark hero (transparent, Bone Linen
 * text). Extracted from the hero so other pages can reuse it.
 *
 * `Facilities` has no page of its own yet, so it anchors to the section that
 * currently explains what clubs offer. Point it at a real route when one exists.
 * Prefetching: the static targets (Home, Login, Register) are marked `prefetch` so
 * their chunks load before the click. The signed-in link ("My reservations" or the
 * dashboard) is deliberately left on the default: it is a dynamic, personal page, and
 * `prefetch={true}` would cache its data for minutes, so a booking made just before
 * clicking would be missing from the list. The default prefetches the route down to
 * its `loading.tsx`, so the click still shows the page skeleton instantly.
 *
 * There is deliberately no `Pricing` link: prices are per club and per court,
 * shown on each club card.
 */
export const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Clubs', href: '/#discover' },
  { label: 'Facilities', href: '/#how-it-works' },
] as const

export function Navbar() {
  const auth = useAuthNav()
  const me = auth.status === 'signed_in' ? homeLinkFor(auth.role) : null

  return (
    <header className="mx-auto flex w-full max-w-[1920px] items-center justify-between px-4 py-5 sm:px-6 lg:px-8 xl:px-12">
      <BrandMark href={auth.status === 'signed_in' && auth.role === 'player' ? '/#discover' : '/'} />

      <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            prefetch
            className="text-sm text-bone-linen/75 transition-colors hover:text-bone-linen"
          >
            {link.label}
          </Link>
        ))}
        {me && (
          <Link
            href={me.href}
            className="text-sm font-medium text-bone-linen transition-colors hover:text-bone-linen/80"
          >
            {me.label}
          </Link>
        )}
      </nav>

      <div className="hidden min-w-[9.5rem] items-center justify-end gap-2 md:flex">
        <AuthActions auth={auth} />
      </div>

      {/* Mobile menu */}
      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-bone-linen hover:bg-bone-linen/10 hover:text-bone-linen md:hidden"
            aria-label="Open menu"
          >
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>ShiftGrid</SheetTitle>
          </SheetHeader>
          <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
            {NAV_LINKS.map((link) => (
              <SheetClose asChild key={link.label}>
                <Link
                  href={link.href}
                  prefetch
                  className="rounded-lg px-3 py-2 text-base hover:bg-muted"
                >
                  {link.label}
                </Link>
              </SheetClose>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-2 px-4">
            {auth.status === 'signed_in' && me ? (
              <>
                <SheetClose asChild>
                  <Button asChild>
                    <Link href={me.href}>{me.label}</Link>
                  </Button>
                </SheetClose>
                <form action="/logout" method="post">
                  <Button type="submit" variant="outline" className="w-full">
                    Sign out
                  </Button>
                </form>
              </>
            ) : auth.status === 'signed_out' ? (
              <>
                <SheetClose asChild>
                  <Button asChild variant="outline">
                    <Link href="/login" prefetch>Login</Link>
                  </Button>
                </SheetClose>
                <SheetClose asChild>
                  <Button asChild>
                    <Link href="/register" prefetch>Register</Link>
                  </Button>
                </SheetClose>
              </>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </header>
  )
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
          className="border-bone-linen/40 bg-transparent text-bone-linen hover:bg-bone-linen/10 hover:text-bone-linen"
        >
          Sign out
        </Button>
      </form>
    )
  }

  return (
    <>
      <Button
        asChild
        variant="ghost"
        className="text-bone-linen hover:bg-bone-linen/10 hover:text-bone-linen"
      >
        <Link href="/login" prefetch>Login</Link>
      </Button>
      {/* Outlined, not green: the hero CTA is this view's one Lime Pulse. */}
      <Button
        asChild
        variant="outline"
        className="border-bone-linen/40 bg-transparent text-bone-linen hover:bg-bone-linen/10 hover:text-bone-linen"
      >
        <Link href="/register" prefetch>Register</Link>
      </Button>
    </>
  )
}
