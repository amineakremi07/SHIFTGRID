'use client'

import * as React from 'react'

import { SECTION_IDS, type SectionId } from '@/lib/scroll'

/**
 * Which landing section is on screen, for the navbar's active state.
 *
 * An IntersectionObserver watches a thin band around the upper-middle of the
 * viewport (the area a reader's eyes are on); the section crossing it is
 * "current". Near the very bottom of the page the last section wins, since a
 * short final section may never reach the band.
 */
export function useActiveSection(): SectionId {
  const [active, setActive] = React.useState<SectionId>('home')

  React.useEffect(() => {
    const elements = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null
    )
    if (elements.length === 0 || !('IntersectionObserver' in window)) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id as SectionId)
        }
      },
      { rootMargin: '-35% 0px -60% 0px', threshold: 0 }
    )
    elements.forEach((el) => observer.observe(el))

    const onScroll = () => {
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
      if (atBottom) setActive(elements[elements.length - 1].id as SectionId)
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  return active
}
