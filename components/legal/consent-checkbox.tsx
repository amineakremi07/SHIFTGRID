import * as React from 'react'
import Link from 'next/link'

import { cn } from '@/lib/utils'

/**
 * A required consent box. Controlled with `checked` + `onChange` (a native checkbox
 * spread with react-hook-form's `field` would bind `value`, not `checked`).
 * The links open in a new tab so the form being filled in is not lost.
 */
export function ConsentCheckbox({
  id,
  checked,
  onChange,
  error,
  children,
  className,
}: {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  error?: string
  /** The sentence after the box. Defaults to the terms + privacy agreement. */
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0.5 size-4 shrink-0 rounded-sm border-input accent-primary"
        />
        <label htmlFor={id} className="text-sm leading-snug text-foreground">
          {children ?? <TermsAndPrivacyText />}
        </label>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export function LegalLinks() {
  return (
    <>
      <Link href="/terms" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-primary">
        Terms of Service
      </Link>{' '}
      and{' '}
      <Link href="/privacy" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-primary">
        Privacy Policy
      </Link>
    </>
  )
}

export function TermsAndPrivacyText() {
  return (
    <>
      I have read and accept the <LegalLinks />, and I consent to ShiftGrid processing my personal data as described there.
    </>
  )
}
