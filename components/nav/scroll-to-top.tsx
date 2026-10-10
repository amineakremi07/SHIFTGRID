'use client'

import * as React from 'react'
import { ArrowUp } from 'lucide-react'

import { t } from '@/lib/i18n/messages'
import { prefersReducedMotion } from '@/lib/scroll'
import { cn } from '@/lib/utils'

const SHOW_AFTER_PX = 300

/**
 * Floating "back to top" button, bottom-right. It fades and scales in once the
 * page is scrolled past 300px. On phones it sits above the floating bottom nav.
 * While hidden it is removed from the tab order and the accessibility tree.
 */
export function ScrollToTop() {
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    const update = () => setVisible(window.scrollY > SHOW_AFTER_PX)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  const goTop = () => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    // Drop a stale "#discover" so the next nav click is a fresh navigation.
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }

  return (
    <button
      type="button"
      onClick={goTop}
      aria-label={t('nav.scrollTop')}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      data-testid="scroll-to-top"
      className={cn(
        'fixed bottom-24 right-4 z-40 flex size-11 items-center justify-center rounded-full md:bottom-6 md:right-6',
        'border border-black/5 bg-background/80 text-foreground backdrop-blur-xl',
        'transition-[opacity,transform,background-color] duration-300 ease-out',
        'hover:bg-card active:scale-90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        visible ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-2 scale-75 opacity-0'
      )}
    >
      <ArrowUp className="size-5" aria-hidden />
    </button>
  )
}
