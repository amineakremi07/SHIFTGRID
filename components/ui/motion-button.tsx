'use client'

import * as React from 'react'
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion'
import type { VariantProps } from 'class-variance-authority'

import { Button, buttonVariants } from '@/components/ui/button'

/**
 * Spring-physics wrapper around the shadcn Button.
 *
 * `Button` renders through Radix `Slot` when `asChild` is set, so it contributes
 * only classes while `motion.button` owns the physics — no style duplication.
 *
 * Honours `prefers-reduced-motion`: the springs collapse to no-ops rather than
 * being swapped for a shorter animation (WCAG 2.2, Milestone 12).
 */

/** Shared spring. Stiff + well damped: responsive, no visible overshoot. */
export const SPRING = { type: 'spring' as const, stiffness: 400, damping: 25, mass: 0.6 }

// HTMLMotionProps (not React.ComponentProps) — React's drag/animation handlers
// collide with Framer Motion's props of the same name.
type MotionButtonProps = HTMLMotionProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Disable the press/hover physics for this instance. */
    static?: boolean
  }

export function MotionButton({
  className,
  variant,
  size,
  static: isStatic = false,
  children,
  ...props
}: MotionButtonProps) {
  const reduceMotion = useReducedMotion()
  const animate = !isStatic && !reduceMotion

  return (
    <Button asChild className={className} variant={variant} size={size}>
      <motion.button
        whileHover={animate ? { y: -1 } : undefined}
        whileTap={animate ? { scale: 0.97 } : undefined}
        transition={SPRING}
        {...props}
      >
        {children}
      </motion.button>
    </Button>
  )
}

export default MotionButton
