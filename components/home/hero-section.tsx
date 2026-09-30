'use client'

import * as React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Trophy, Users } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Navbar } from '@/components/nav/navbar'
import { SPRING } from '@/components/ui/motion-button'
import { cn } from '@/lib/utils'

/* ==========================================================================
   Public landing hero.
   Forest Depths container (DESIGN.md "Hero / Dark Section") on the Bone Linen
   canvas. Every piece of hero text is Bone Linen — DESIGN.md forbids coloured
   text on this surface — and the single Lime Pulse element is the CTA.
   ========================================================================== */

/** Decorative, hence aria-hidden: initials on the neutral palette. */
const AVATARS = [
  { initials: 'YB', className: 'bg-oat-milk' },
  { initials: 'AM', className: 'bg-driftwood' },
  { initials: 'SK', className: 'bg-bone-linen' },
  { initials: '+', className: 'bg-peacock-teal text-bone-linen' },
]

/** Faint padel-court linework — sport-specific texture, no fills. */
function CourtLines({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 600"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      className={className}
    >
      <rect x="20" y="20" width="360" height="560" rx="4" />
      <line x1="20" y1="300" x2="380" y2="300" />
      <line x1="200" y1="150" x2="200" y2="450" />
      <line x1="20" y1="150" x2="380" y2="150" />
      <line x1="20" y1="450" x2="380" y2="450" />
    </svg>
  )
}

/** Entrance spring, then a slow idle bob (skipped under reduced motion). */
function Floating({
  children,
  delay = 0,
  bob = 6,
  className,
}: {
  children: React.ReactNode
  delay?: number
  bob?: number
  className?: string
}) {
  const reduce = useReducedMotion()

  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay }}
    >
      {/* Nested so the idle loop never fights the entrance spring. */}
      <motion.div
        animate={reduce ? undefined : { y: [0, -bob, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay }}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

export function HeroSection() {
  const reduce = useReducedMotion()

  return (
    <section className="mx-auto w-full max-w-[1920px] px-3 pt-3 sm:px-5 md:pt-5 xl:px-9" aria-labelledby="hero-title">
      <div className="relative isolate w-full overflow-hidden rounded-2xl bg-forest-depths text-bone-linen">
        {/* Atmosphere: a deep teal wash and court linework. Both decorative. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -top-40 -z-10 size-[560px] rounded-full bg-peacock-teal/40 blur-3xl"
        />
        <CourtLines className="pointer-events-none absolute -bottom-10 right-10 -z-10 hidden h-[560px] rotate-6 text-bone-linen/10 lg:block" />

        <Navbar />

        {/* ----------------------------- content ---------------------------- */}
        <div className="relative px-5 pb-14 pt-8 md:px-10 md:pb-20 md:pt-14 lg:pb-28">
          {/* Top-left social-proof badge. Figure is placeholder copy. */}
          <Floating bob={4}>
            <div className="inline-flex items-center gap-3 rounded-xl border border-bone-linen/20 bg-bone-linen/10 py-2 pl-2 pr-4 backdrop-blur-md">
              <div className="flex -space-x-1.5" aria-hidden>
                {AVATARS.map((a) => (
                  <span
                    key={a.initials}
                    className={cn(
                      'flex size-8 items-center justify-center rounded-full border-2 border-forest-depths text-[0.65rem] font-semibold text-obsidian-plum',
                      a.className
                    )}
                  >
                    {a.initials}
                  </span>
                ))}
              </div>
              <p className="text-sm leading-tight">
                <span className="font-semibold">25k+ Active Players</span>
                <span className="block text-bone-linen/70">Tunisia</span>
              </p>
            </div>
          </Floating>

          <h1
            id="hero-title"
            className="mt-8 max-w-[14ch] text-5xl font-semibold uppercase leading-[0.92] tracking-tight sm:text-6xl md:max-w-[16ch] md:text-7xl lg:max-w-[18ch] lg:text-[5.5rem]"
          >
            Reserve your ideal court in seconds
          </h1>

          <p className="mt-6 max-w-[420px] text-base leading-relaxed text-oat-milk md:text-lg">
            Padel, tennis and football courts across Tunisia. See live
            availability, pick a slot, and lock it in — priced in TND.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild className="h-12 px-6 text-base">
              <motion.a
                href="#discover"
                whileHover={reduce ? undefined : { y: -1 }}
                whileTap={reduce ? undefined : { scale: 0.97 }}
                transition={SPRING}
              >
                Find a court
                <ArrowRight aria-hidden />
              </motion.a>
            </Button>
            <Button
              asChild
              variant="ghost"
              className="h-12 px-5 text-base text-bone-linen hover:bg-bone-linen/10 hover:text-bone-linen"
            >
              <a href="#how-it-works">How it works</a>
            </Button>
          </div>

          {/* Featured match — glass card. Placeholder content until there is a
              tournaments/events model to read from. */}
          <Floating
            delay={0.15}
            bob={8}
            className="mt-10 w-full max-w-xs lg:absolute lg:bottom-14 lg:right-14 lg:mt-0"
          >
            <div className="rounded-xl border border-bone-linen/20 bg-bone-linen/10 p-4 backdrop-blur-md">
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-bone-linen/15">
                  <Trophy className="size-5" aria-hidden />
                </span>
                <Badge className="bg-bone-linen/15 text-bone-linen">
                  4 spots left
                </Badge>
              </div>
              <p className="mt-3 text-xs uppercase tracking-wide text-bone-linen/70">
                Featured match
              </p>
              <p className="mt-0.5 text-lg font-semibold leading-tight">
                Tunis Padel Open
              </p>
              <p className="mt-1 text-sm text-bone-linen/75">
                Sat · 18:30 · Lac 2
              </p>
              <p className="mt-3 flex items-center gap-1.5 border-t border-bone-linen/15 pt-3 text-sm text-bone-linen/75">
                <Users className="size-4" aria-hidden />
                12 / 16 players joined
              </p>
            </div>
          </Floating>
        </div>
      </div>
    </section>
  )
}

export default HeroSection
