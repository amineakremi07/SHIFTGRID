'use client'

import * as React from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Responsive photo carousel for the public club page. A scroll-snap strip, so touch
 * swipe and trackpads work natively; previous/next buttons, thumbnails and the arrow
 * keys drive the same scroll position. No library, no layout shift (fixed aspect ratio).
 */
export function ClubGallery({ urls, name }: { urls: string[]; name: string }) {
  const track = React.useRef<HTMLDivElement>(null)
  const [index, setIndex] = React.useState(0)
  // While a button/thumbnail/key scroll is animating, the scroll handler must not report the
  // slides it passes through (the counter would flicker back to the old photo).
  const lockedUntil = React.useRef(0)
  const count = urls.length

  const goTo = React.useCallback(
    (i: number) => {
      const el = track.current
      if (!el) return
      const next = Math.min(Math.max(i, 0), count - 1)
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      lockedUntil.current = reduce ? 0 : Date.now() + 700
      el.scrollTo({ left: next * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' })
      setIndex(next)
    },
    [count]
  )

  // Keep the counter and thumbnails in step with a swipe or trackpad scroll.
  const onScroll = () => {
    const el = track.current
    if (!el || el.clientWidth === 0 || Date.now() < lockedUntil.current) return
    setIndex(Math.round(el.scrollLeft / el.clientWidth))
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      goTo(index + 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      goTo(index - 1)
    }
  }

  if (count === 0) return null

  return (
    <section aria-label={`Photos of ${name}`} className="space-y-3" data-testid="club-gallery">
      <div
        className="group relative"
        role="group"
        aria-roledescription="carousel"
        aria-label={`${name} photo gallery`}
        onKeyDown={onKeyDown}
      >
        <div
          ref={track}
          onScroll={onScroll}
          tabIndex={0}
          aria-label={`Photo ${index + 1} of ${count}. Use the left and right arrow keys to browse.`}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-xl bg-muted outline-offset-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {urls.map((url, i) => (
            <div
              key={url}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              className="relative aspect-[4/3] w-full shrink-0 snap-center sm:aspect-[16/10]"
            >
              <Image
                src={url}
                alt={`${name}, photo ${i + 1} of ${count}`}
                fill
                // Straight from the storage CDN: no image proxy that can fail, photos are downscaled at upload.
                unoptimized
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
                priority={i === 0}
              />
            </div>
          ))}
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => goTo(index - 1)}
              disabled={index === 0}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow transition-opacity disabled:opacity-0"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              disabled={index === count - 1}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow transition-opacity disabled:opacity-0"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
            <span className="absolute bottom-2 right-2 rounded-full bg-background/90 px-2.5 py-0.5 text-xs font-medium tabular-nums" aria-hidden>
              {index + 1} / {count}
            </span>
          </>
        )}
      </div>

      {count > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Choose a photo">
          {urls.map((url, i) => (
            <li key={url} className="shrink-0">
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === index}
                className={cn(
                  'relative block h-14 w-20 overflow-hidden rounded-md ring-offset-2 transition-opacity',
                  i === index ? 'opacity-100 ring-2 ring-foreground' : 'opacity-60 hover:opacity-100'
                )}
              >
                <Image src={url} alt="" fill unoptimized sizes="80px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
