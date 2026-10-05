'use client'

import * as React from 'react'
import { Info } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/**
 * Small ⓘ button that opens the full sentence in a popover. Use it to keep the visible text short on
 * mobile while the complete wording (terms, rules) stays one tap away. A real button, so it works
 * with touch and keyboard; `label` is its accessible name.
 */
export function InfoTip({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          // Inside a <label>, a click would otherwise also select the radio.
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2',
            className
          )}
        >
          <Info className="size-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-xs leading-relaxed" align="end">
        {children}
      </PopoverContent>
    </Popover>
  )
}
