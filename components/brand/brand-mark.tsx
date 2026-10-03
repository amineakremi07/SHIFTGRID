import Image from 'next/image'
import Link from 'next/link'

import { cn } from '@/lib/utils'

/**
 * The ShiftGrid logo, linking home (or wherever `href` says).
 *
 * Two transparent files share the same artwork and differ only in the wordmark:
 *  - `light` (/logo.svg): white wordmark, for the dark green hero;
 *  - `dark`  (/logo-dark.svg): navy wordmark, for light surfaces such as the login pages.
 * The grid icon is emerald in both.
 *
 * The artwork is drawn on a 1024px square with the mark in the middle third, so the
 * image fills a wide fixed-ratio box with `object-cover`: it then fills the height
 * instead of shrinking to a sliver.
 */
export function BrandMark({
  className,
  imageClassName = 'h-9 sm:h-10',
  href = '/',
  tone = 'light',
}: {
  className?: string
  /** Sets the logo height (the width follows from the ratio). */
  imageClassName?: string
  href?: string
  tone?: 'light' | 'dark'
}) {
  return (
    <Link href={href} prefetch className={cn('inline-flex items-center', className)}>
      <span className={cn('relative block aspect-[2.7/1]', imageClassName)}>
        <Image
          src={tone === 'dark' ? '/logo-dark.svg' : '/logo.svg'}
          alt="ShiftGrid"
          fill
          priority
          unoptimized
          sizes="140px"
          className="object-cover"
        />
      </span>
    </Link>
  )
}
