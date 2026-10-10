/** Section anchors on the landing page, in page order. */
export const SECTION_IDS = ['home', 'discover', 'how-it-works'] as const
export type SectionId = (typeof SECTION_IDS)[number]

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Scrolls to a section and puts its hash in the URL, whether or not the URL
 * already carries that hash.
 *
 * A plain `<a href="#discover">` does nothing when the URL is already `#discover`
 * (the browser sees no hash change), which is the "Clubs link dead after scrolling
 * back up" bug. Scrolling explicitly makes the click work every time.
 * Returns false when the element is not on this page, so the caller can fall back
 * to normal navigation.
 */
export function scrollToSection(id: string): boolean {
  const target = document.getElementById(id)
  if (!target) return false

  target.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'start',
  })

  // Leave a shareable URL, without stacking a history entry per click.
  if (window.location.hash !== `#${id}`) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${id}`)
  }
  return true
}

/** Extracts the section id from "#x" or "/#x"; null for any other href. */
export function hashTarget(href: string): string | null {
  const match = /^\/?#([\w-]+)$/.exec(href)
  return match ? match[1] : null
}
