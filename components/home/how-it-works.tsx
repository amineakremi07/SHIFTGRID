'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { BadgeCheck, Building2, CalendarClock, MapPin } from 'lucide-react'

import { SPRING } from '@/components/ui/motion-button'
import { cn } from '@/lib/utils'

/* ==========================================================================
   "How it works": four steps, one horizontal grid on desktop.
   Steps 1–3 are Oat Milk cards. Step 4 is the Forest Depths callout — the
   moment the player actually commits, so it gets the high-contrast surface.
   ========================================================================== */

const STEPS = [
  {
    icon: MapPin,
    title: 'Choose a Court',
    description: 'Pick your sport and the area you want to play in.',
    tags: ['Location', 'Sport'],
  },
  {
    icon: Building2,
    title: 'Explore Facilities',
    description: 'Compare what each complex offers before you commit.',
    tags: ['Surface type', 'Lighting', 'Amenities'],
  },
  {
    icon: CalendarClock,
    title: 'Select Time Slot',
    description:
      'Read live availability in the slot matrix. Booked and held slots are clearly marked.',
    tags: ['Interactive matrix'],
  },
  {
    icon: BadgeCheck,
    title: 'Confirm & Play',
    description:
      'Your slot is locked the instant you confirm, with the total shown in TND.',
    tags: ['Instant lock', 'TND confirmation'],
    featured: true,
  },
] as const

export function HowItWorks() {
  const reduce = useReducedMotion()

  return (
    <section
      id="how-it-works"
      aria-labelledby="how-title"
      className="mx-auto w-full max-w-[1200px] scroll-mt-6 px-5 pb-20 pt-4 md:pb-28"
    >
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        How it works
      </p>
      <h2
        id="how-title"
        className="mt-2 max-w-[20ch] text-3xl font-semibold tracking-tight md:text-4xl"
      >
        From search to game in four steps
      </h2>

      <motion.ol
        className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        initial={reduce ? false : 'hidden'}
        whileInView="show"
        viewport={{ once: true, margin: '-80px' }}
        variants={{ show: { transition: { staggerChildren: 0.08 } } }}
      >
        {STEPS.map((step, i) => {
          const Icon = step.icon
          const featured = 'featured' in step && step.featured

          return (
            <motion.li
              key={step.title}
              variants={{
                hidden: { opacity: 0, y: 16 },
                show: { opacity: 1, y: 0 },
              }}
              whileHover={reduce ? undefined : { y: -2 }}
              transition={SPRING}
              className={cn(
                'flex flex-col rounded-xl p-6',
                featured
                  ? 'bg-forest-depths text-bone-linen'
                  : 'bg-card text-card-foreground'
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'flex size-10 items-center justify-center rounded-lg',
                    featured ? 'bg-bone-linen/15' : 'bg-background'
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                </span>
                <span
                  className={cn(
                    'text-sm font-medium tabular-nums',
                    featured ? 'text-bone-linen/70' : 'text-muted-foreground'
                  )}
                >
                  0{i + 1}
                </span>
              </div>

              <h3 className="mt-6 text-xl font-semibold leading-tight">
                {step.title}
              </h3>
              <p
                className={cn(
                  'mt-2 text-sm leading-relaxed',
                  featured ? 'text-oat-milk' : 'text-muted-foreground'
                )}
              >
                {step.description}
              </p>

              <ul className="mt-5 flex flex-wrap gap-1.5 pt-1">
                {step.tags.map((tag) => (
                  <li
                    key={tag}
                    className={cn(
                      'rounded-sm px-2 py-0.5 text-xs',
                      featured
                        ? 'bg-bone-linen/15 text-bone-linen'
                        : 'bg-background text-muted-foreground'
                    )}
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            </motion.li>
          )
        })}
      </motion.ol>
    </section>
  )
}

export default HowItWorks
