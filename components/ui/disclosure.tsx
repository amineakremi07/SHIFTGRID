import * as React from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Collapsible section on the native <details>: keyboard and screen-reader friendly, no JS state, and the
 * content stays in the DOM when closed. Used to fold long notes (cancellation terms, link warnings) behind
 * a one-line title.
 */
export function Disclosure({
  title,
  icon,
  children,
  defaultOpen = false,
  className,
}: {
  title: React.ReactNode
  icon?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
}) {
  return (
    <details open={defaultOpen} className={cn('group rounded-lg border border-border text-sm', className)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 font-medium marker:hidden [&::-webkit-details-marker]:hidden">
        {icon}
        <span className="min-w-0 flex-1">{title}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-muted-foreground">{children}</div>
    </details>
  )
}
