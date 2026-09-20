'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

const ScrollArea = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { native?: boolean }
>(({ className, children, native = false, ...props }, ref) => {
  if (native) {
    return (
      <div
        ref={ref}
        className={cn('overflow-y-auto h-full', className)}
        {...props}
      >
        {children}
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className={cn('relative overflow-hidden', className)}
      {...props}
    >
      <div className="h-full w-full overflow-y-auto pr-2">
        {children}
      </div>
    </div>
  )
})
ScrollArea.displayName = 'ScrollArea'

export { ScrollArea }
