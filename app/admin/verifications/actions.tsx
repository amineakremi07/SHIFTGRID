'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileText, Eye, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function OrganizationActionsClient({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [isApproving, setIsApproving] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')

  const handleApprove = async () => {
    setIsApproving(true)
    try {
      const res = await fetch('/api/approve-organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      })
      const data = await res.json()
      if (data.success) {
        window.location.reload()
      } else {
        alert(data.error || 'Failed to approve organization')
      }
    } catch (error) {
      alert('An unexpected error occurred')
    } finally {
      setIsApproving(false)
    }
  }

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      alert('Please provide a rejection reason')
      return
    }
    setIsRejecting(true)
    try {
      const res = await fetch('/api/reject-organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, reason: rejectionReason }),
      })
      const data = await res.json()
      if (data.success) {
        window.location.reload()
      } else {
        alert(data.error || 'Failed to reject organization')
      }
    } catch (error) {
      alert('An unexpected error occurred')
    } finally {
      setIsRejecting(false)
    }
  }

  return (
    <Tabs defaultValue="actions" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="actions">Actions</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
      </TabsList>

      <TabsContent value="actions" className="space-y-3 pt-3">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="default" className="w-full" disabled={isApproving}>
              {isApproving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Approve Organization
                </>
              )}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Approve Organization</DialogTitle>
              <DialogDescription>
                Are you sure you want to approve "{orgName}"? This will change their status to approved and they will be able to access the platform.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => {}}>
                Cancel
              </Button>
              <Button onClick={handleApprove} disabled={isApproving}>
                {isApproving ? 'Approving...' : 'Confirm Approval'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="destructive" className="w-full" disabled={isRejecting}>
              {isRejecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Rejecting...
                </>
              ) : (
                <>
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject Organization
                </>
              )}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Organization</DialogTitle>
              <DialogDescription>
                Are you sure you want to reject "{orgName}"? This will change their status to rejected and they will not be able to access the platform.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="rejection-reason">Rejection Reason (Required)</Label>
                <Textarea
                  id="rejection-reason"
                  placeholder="Enter the reason for rejecting this organization..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={4}
                  disabled={isRejecting}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectionReason('')}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleReject} disabled={isRejecting}>
                {isRejecting ? 'Rejecting...' : 'Confirm Rejection'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TabsContent>

      <TabsContent value="documents" className="space-y-3 pt-3">
        <DocumentViewer orgId={orgId} />
      </TabsContent>
    </Tabs>
  )
}

function DocumentViewer({ orgId }: { orgId: string }) {
  const [docUrl, setDocUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDocument = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/verification-document?orgId=${orgId}`)
      const data = await res.json()
      if (data.success && data.url) {
        setDocUrl(data.url)
      } else {
        setError(data.error || 'No document found')
      }
    } catch {
      setError('Failed to fetch document')
    } finally {
      setIsLoading(false)
    }
  }

  if (!docUrl && !isLoading && !error) {
    return (
      <Button variant="outline" className="w-full" onClick={fetchDocument}>
        <FileText className="mr-2 h-4 w-4" />
        Load Verification Document
      </Button>
    )
  }

  if (isLoading) {
    return (
      <Button variant="outline" className="w-full" disabled>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading...
      </Button>
    )
  }

  if (error) {
    return (
      <div className="text-sm text-destructive">
        {error}
        <Button variant="ghost" size="sm" className="ml-2" onClick={fetchDocument}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <a
        href={docUrl!}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm text-primary hover:underline"
      >
        <FileText className="h-4 w-4" />
        <span>View Verification Document</span>
        <Eye className="h-3 w-3 ml-auto" />
      </a>
      <Button variant="ghost" size="sm" className="w-full" onClick={fetchDocument}>
        Refresh Document Link
      </Button>
    </div>
  )
}