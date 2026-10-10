'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { BadgeCheck, Building2, CalendarClock, MapPin } from 'lucide-react'

import { t } from '@/lib/i18n/messages'
import { SPRING } from '@/components/ui/motion-button'
import type { MessageKey } from '@/lib/i18n/messages'
import { cn } from '@/lib/utils'

/* ==========================================================================
   "How it works": four steps, one horizontal grid on desktop.
   Steps 1–3 are Oat Milk cards. Step 4 is the Forest Depths callout — the
   moment the player actually commits, so it gets the high-contrast surface.
   ========================================================================== */

const STEPS = [
  { icon: MapPin, id: 's1', tags: ['t1', 't2'] },
  { icon: Building2, id: 's2', tags: ['t1', 't2', 't3'] },
  { icon: CalendarClock, id: 's3', tags: ['t1'] },
  { icon: BadgeCheck, id: 's4', tags: ['t1', 't2'], featured: true },
] as const

export function HowItWorks() {
  const reduce = useReducedMotion()

  return (
    <section
      id="how-it-works"
      aria-labelledby="how-title"
      className="scroll-mt-24 border-t border-border/40 bg-muted/40"
    >
      <div className="mx-auto w-full max-w-[1920px] px-4 py-24 sm:px-6 md:py-32 lg:px-8 xl:px-12">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {t('how.eyebrow')}
      </p>
      <h2
        id="how-title"
        className="mt-3 max-w-[22ch] text-3xl font-semibold leading-[1.1] tracking-tight text-balance md:text-5xl"
      >
        {t('how.title')}
      </h2>

      <motion.ol
        className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
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
              key={step.id}
              variants={{
                hidden: { opacity: 0, y: 16 },
                show: { opacity: 1, y: 0 },
              }}
              whileHover={reduce ? undefined : { y: -2 }}
              transition={SPRING}
              className={cn(
                'flex flex-col rounded-2xl border p-6 transition-transform duration-300 hover:scale-[1.01]',
                featured
                  ? 'border-black/5 bg-forest-depths text-bone-linen'
                  : 'border-black/5 bg-card text-card-foreground'
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
                {t(`how.${step.id}.title` as MessageKey)}
              </h3>
              <p
                className={cn(
                  'mt-2 text-sm leading-relaxed',
                  featured ? 'text-oat-milk' : 'text-muted-foreground'
                )}
              >
                {t(`how.${step.id}.body` as MessageKey)}
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
                    {t(`how.${step.id}.${tag}` as MessageKey)}
                  </li>
                ))}
              </ul>
            </motion.li>
          )
        })}
      </motion.ol>
      </div>
    </section>
  )
}

export default HowItWorks
