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
import { cn } from '@/lib/utils'

/**
 * Public site navigation, rendered on the dark hero (transparent, Bone Linen
 * text). Extracted from the hero so other pages can reuse it.
 *
 * `Facilities` has no page of its own yet, so it anchors to the section that
 * currently explains what clubs offer. Point it at a real route when one exists.
 * There is deliberately no `Pricing` link: prices are per club and per court,
 * shown on each club card.
 */
export const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Clubs', href: '#discover' },
  { label: 'Facilities', href: '#how-it-works' },
] as const

export function BrandMark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        'font-heading text-xl font-semibold tracking-tight text-bone-linen',
        className
      )}
    >
      ShiftGrid
    </Link>
  )
}

export function Navbar() {
  return (
    <header className="mx-auto flex w-full max-w-[1920px] items-center justify-between px-4 py-5 sm:px-6 lg:px-8 xl:px-12">
      <BrandMark />

      <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className="text-sm text-bone-linen/75 transition-colors hover:text-bone-linen"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="hidden items-center gap-2 md:flex">
        <Button
          asChild
          variant="ghost"
          className="text-bone-linen hover:bg-bone-linen/10 hover:text-bone-linen"
        >
          <Link href="/login-owner">Login</Link>
        </Button>
        {/* Outlined, not green: the hero CTA is this view's one Lime Pulse. */}
        <Button
          asChild
          variant="outline"
          className="border-bone-linen/40 bg-transparent text-bone-linen hover:bg-bone-linen/10 hover:text-bone-linen"
        >
          <Link href="/register">Register</Link>
        </Button>
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
                  className="rounded-lg px-3 py-2 text-base hover:bg-muted"
                >
                  {link.label}
                </Link>
              </SheetClose>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-2 px-4">
            <SheetClose asChild>
              <Button asChild variant="outline">
                <Link href="/login-owner">Login</Link>
              </Button>
            </SheetClose>
            <SheetClose asChild>
              <Button asChild>
                <Link href="/register">Register</Link>
              </Button>
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  )
}
