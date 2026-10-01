'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cancelBookingAction } from '@/lib/actions/bookings'

/**
 * Confirm step for a guest's secret cancellation link. The server re-checks the
 * token and the 24 h window; this only collects the confirmation.
 */
export function GuestCancelForm({ bookingId, token }: { bookingId: string; token: string }) {
  const router = useRouter()
  const [reason, setReason] = React.useState('')
  const [confirming, setConfirming] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const cancel = async () => {
    setBusy(true)
    const result = await cancelBookingAction({ bookingId, guestToken: token, reason })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.message)
      router.refresh() // show the booking's real state
      return
    }
    toast.success('Booking cancelled. The slot is free again.')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-1.5">
        <Label htmlFor="guest-reason">Reason (optional)</Label>
        <Textarea
          id="guest-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={300}
          disabled={busy}
        />
      </div>

      {!confirming ? (
        <Button variant="destructive" className="w-full" onClick={() => setConfirming(true)}>
          Cancel this booking
        </Button>
      ) : (
        <div className="space-y-2 rounded-xl border border-destructive/30 p-4">
          <p className="text-sm font-medium">Cancel for good? This cannot be undone.</p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirming(false)} disabled={busy}>
              Keep booking
            </Button>
            <Button variant="destructive" className="flex-1" onClick={cancel} disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              Yes, cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
