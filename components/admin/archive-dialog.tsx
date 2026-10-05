'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { archiveOrganizationAction, restoreOrganizationAction } from '@/lib/actions/admin-verification'

/**
 * How a platform admin "removes" a club: archive it (soft delete). Nothing is ever deleted: the club
 * vanishes from the public site and its owner's dashboard closes, but every booking, payment and
 * court stays for the club's accounting. If the club still has upcoming bookings the admin must
 * confirm a second time that they are cancelled (the players are emailed).
 */
export function ArchiveDialog({ orgId, orgName, archived }: { orgId: string; orgName: string; archived: boolean }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [upcoming, setUpcoming] = React.useState<number | null>(null)

  const reset = (next: boolean) => {
    setOpen(next)
    if (!next) setUpcoming(null)
  }

  const run = async (cancelUpcoming: boolean) => {
    setBusy(true)
    const result = archived ? await restoreOrganizationAction(orgId) : await archiveOrganizationAction(orgId, cancelUpcoming)
    setBusy(false)
    if (!result.ok) {
      if ('upcoming' in result && result.upcoming) return void setUpcoming(result.upcoming)
      toast.error(result.message)
      return
    }
    toast.success(archived ? `${orgName} was restored.` : `${orgName} was archived. Its history is kept.`)
    reset(false)
    router.refresh()
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => reset(true)} className="w-full">
        {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />} {archived ? 'Restore club' : 'Archive club'}
      </Button>

      <Dialog open={open} onOpenChange={(o) => !busy && reset(o)}>
        <DialogContent className="bg-[#eae6df] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{archived ? `Restore ${orgName}?` : `Archive ${orgName}?`}</DialogTitle>
            <DialogDescription>
              {archived
                ? 'The club and the courts archived with it come back: it is listed again and its owner can sign in to the dashboard.'
                : 'The club disappears from the public site and booking, its owner can no longer use the dashboard, and its API keys stop working. Nothing is deleted: bookings, payments and courts stay in the history, and you can restore the club at any time.'}
            </DialogDescription>
          </DialogHeader>

          {upcoming !== null && (
            <p role="alert" className="rounded-lg bg-[#f7f5f2] px-3 py-2.5 text-sm" data-testid="archive-upcoming">
              This club has <strong>{upcoming}</strong> upcoming booking{upcoming === 1 ? '' : 's'}. Archiving will cancel {upcoming === 1 ? 'it' : 'them'},
              free the slot{upcoming === 1 ? '' : 's'} and email the player{upcoming === 1 ? '' : 's'}.
            </p>
          )}

          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => reset(false)} disabled={busy}>
              Cancel
            </Button>
            {archived ? (
              <Button onClick={() => run(false)} disabled={busy} className="bg-[#1d3023] text-[#f7f5f2] hover:bg-[#1d3023]/90">
                {busy && <Loader2 className="animate-spin" aria-hidden />}
                Restore club
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => run(upcoming !== null)} disabled={busy}>
                {busy && <Loader2 className="animate-spin" aria-hidden />}
                {upcoming !== null ? `Cancel ${upcoming} booking${upcoming === 1 ? '' : 's'} and archive` : 'Archive club'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
