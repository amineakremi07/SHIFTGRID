'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, ExternalLink, FileText, Loader2, XCircle } from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  approveOrganization,
  getVerificationDocument,
  rejectOrganization,
  type DocumentResult,
} from '@/lib/actions/admin-verification'

/**
 * Review one club: inspect the registration proof (signed, short-lived URL), then
 * approve, or reject with a mandatory reason. Rejection is a second step inside
 * the same dialog so a reason can never be skipped.
 */
export function ReviewDialog({
  orgId,
  orgName,
  hasDocument,
  canApprove,
  canReject,
}: {
  orgId: string
  orgName: string
  hasDocument: boolean
  canApprove: boolean
  canReject: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [doc, setDoc] = React.useState<DocumentResult | null>(null)
  const [docLoading, setDocLoading] = React.useState(false)
  const [rejecting, setRejecting] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const [reasonError, setReasonError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<'approve' | 'reject' | null>(null)

  const loadDoc = React.useCallback(async () => {
    setDocLoading(true)
    setDoc(await getVerificationDocument(orgId))
    setDocLoading(false)
  }, [orgId])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setRejecting(false)
      setReason('')
      setReasonError(null)
      if (hasDocument) void loadDoc()
      else setDoc({ ok: false, message: 'No document was uploaded for this club.' })
    } else {
      setDoc(null) // the signed URL is short-lived; fetch a fresh one next time
    }
  }

  const finish = (message: string) => {
    toast.success(message)
    setOpen(false)
    router.refresh()
  }

  const approve = async () => {
    setBusy('approve')
    const result = await approveOrganization(orgId)
    setBusy(null)
    if (!result.ok) {
      toast.error(result.message)
      router.refresh()
      return
    }
    finish(
      result.emailSent
        ? `${orgName} approved and is now public. The owner was emailed.`
        : `${orgName} approved and is now public. The email to the owner could not be sent.`
    )
  }

  const reject = async () => {
    if (reason.trim().length < 10) {
      setReasonError('Please give a reason of at least 10 characters.')
      return
    }
    setBusy('reject')
    const result = await rejectOrganization(orgId, reason)
    setBusy(null)
    if (!result.ok) {
      setReasonError(result.message)
      return
    }
    finish(
      result.emailSent
        ? `${orgName} rejected. The owner was emailed the reason.`
        : `${orgName} rejected. The email to the owner could not be sent.`
    )
  }

  return (
    <>
      <Button
        onClick={() => handleOpenChange(true)}
        className="w-full bg-[#1d3023] text-[#f7f5f2] hover:bg-[#1d3023]/90"
      >
        <FileText aria-hidden /> Review
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[92vh] overflow-y-auto bg-[#eae6df] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{orgName}</DialogTitle>
            <DialogDescription>
              Check the registration proof matches the club, then approve or reject.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-64 overflow-hidden rounded-lg bg-[#f7f5f2]">
            {docLoading || (hasDocument && !doc) ? (
              <div className="flex h-64 items-center justify-center text-sm text-[#645757]">
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> Loading document
              </div>
            ) : doc && doc.ok ? (
              <div>
                {doc.kind === 'pdf' && (
                  <iframe src={doc.url} title={`Registration proof for ${orgName}`} className="h-[60vh] w-full" />
                )}
                {doc.kind === 'image' && (
                  // eslint-disable-next-line @next/next/no-img-element -- signed, expiring URL; next/image would proxy and cache it
                  <img src={doc.url} alt={`Registration proof for ${orgName}`} className="max-h-[60vh] w-full object-contain" />
                )}
                {doc.kind === 'other' && (
                  <p className="p-6 text-center text-sm text-[#645757]">This file type cannot be previewed.</p>
                )}
                <div className="flex items-center justify-between gap-3 border-t border-[#d7d2cc] px-3 py-2 text-sm">
                  <span className="truncate text-[#645757]">{doc.name}</span>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 underline-offset-4 hover:underline"
                  >
                    Open in new tab <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center gap-2 px-6 text-center text-sm">
                <FileText className="size-8 text-[#645757]" aria-hidden />
                <p>{doc && !doc.ok ? doc.message : 'No document.'}</p>
                {hasDocument && (
                  <Button variant="outline" size="sm" onClick={loadDoc}>
                    Try again
                  </Button>
                )}
              </div>
            )}
          </div>

          {rejecting && (
            <div className="grid gap-1.5">
              <Label htmlFor={`reason-${orgId}`}>Reason for rejection (sent to the owner)</Label>
              <Textarea
                id={`reason-${orgId}`}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value)
                  setReasonError(null)
                }}
                rows={3}
                maxLength={1000}
                placeholder="e.g. Invalid patent / commercial license copy"
                aria-invalid={reasonError ? true : undefined}
                disabled={busy === 'reject'}
                autoFocus
              />
              {reasonError && (
                <p role="alert" className="text-xs text-destructive">
                  {reasonError}
                </p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-end">
            {rejecting ? (
              <>
                <Button variant="outline" onClick={() => setRejecting(false)} disabled={busy !== null}>
                  Back
                </Button>
                <Button variant="destructive" onClick={reject} disabled={busy !== null}>
                  {busy === 'reject' && <Loader2 className="animate-spin" aria-hidden />}
                  Confirm rejection
                </Button>
              </>
            ) : (
              <>
                {canReject && (
                  <Button variant="destructive" onClick={() => setRejecting(true)} disabled={busy !== null}>
                    <XCircle aria-hidden /> Reject
                  </Button>
                )}
                {canApprove && (
                  <Button
                    onClick={approve}
                    disabled={busy !== null}
                    className="bg-[#1d3023] text-[#f7f5f2] hover:bg-[#1d3023]/90"
                  >
                    {busy === 'approve' ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle aria-hidden />}
                    Approve and publish
                  </Button>
                )}
                {!canApprove && !canReject && (
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Close
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
