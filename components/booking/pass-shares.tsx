'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { regenerateShareInviteAction } from '@/lib/actions/payments'
import type { PassShare } from '@/lib/pass'
import { formatTND } from '@/lib/payments'

/**
 * Who has paid their share, and for the organizer a way to get a payment link
 * for anyone who has not. Links are never stored in readable form (only a hash),
 * so "Create link" mints a fresh one and the previous link stops working.
 */
export function PassShares({
  bookingId,
  shares,
  canManage,
  guestToken,
}: {
  bookingId: string
  shares: PassShare[]
  /** The organizer (member or guest-link holder) of a booking still awaiting payment. */
  canManage: boolean
  guestToken: string | null
}) {
  const [links, setLinks] = React.useState<Record<number, string>>({})
  const [busy, setBusy] = React.useState<number | null>(null)
  const [copied, setCopied] = React.useState<number | null>(null)

  const create = async (shareNo: number) => {
    setBusy(shareNo)
    const res = await regenerateShareInviteAction({ bookingId, shareNo, guestToken: guestToken ?? undefined })
    setBusy(null)
    if (!res.ok) return void toast.error(res.message)
    setLinks((l) => ({ ...l, [shareNo]: `${window.location.origin}${res.path}` }))
  }

  const copy = async (shareNo: number, url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(shareNo)
      window.setTimeout(() => setCopied((c) => (c === shareNo ? null : c)), 2000)
    } catch {
      toast.error('Could not copy. Select the link and copy it by hand.')
    }
  }

  return (
    <ul className="divide-y divide-border">
      {shares.map((s) => (
        <li key={s.shareNo} className="py-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">
              {s.isOrganizer ? 'You' : (s.payerName ?? `Player ${s.shareNo}`)}{' '}
              <span className="font-normal tabular-nums text-muted-foreground">{formatTND(s.amount)}</span>
            </span>
            <Badge variant={s.status === 'paid' ? 'success' : s.status === 'refunded' ? 'secondary' : 'warning'}>
              {s.status === 'paid' ? 'Paid' : s.status === 'refunded' ? 'Refunded' : 'Waiting'}
            </Badge>
          </div>

          {canManage && s.status === 'pending' && !s.isOrganizer && (
            <div className="mt-2 space-y-2">
              {links[s.shareNo] ? (
                <>
                  <input
                    readOnly
                    value={links[s.shareNo]}
                    aria-label={`Payment link for player ${s.shareNo}`}
                    onFocus={(e) => e.currentTarget.select()}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => copy(s.shareNo, links[s.shareNo])}>
                    {copied === s.shareNo ? 'Copied' : 'Copy link'}
                  </Button>
                </>
              ) : (
                <Button type="button" variant="outline" size="sm" disabled={busy === s.shareNo} onClick={() => create(s.shareNo)}>
                  {busy === s.shareNo && <Loader2 className="animate-spin" aria-hidden />}
                  Create payment link
                </Button>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
