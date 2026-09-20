'use client'

import { useState } from 'react'
import { XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export default function RejectOrganizationForm({ orgId, orgName, onClose }: { orgId: string; orgName: string; onClose: () => void }) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [reason, setReason] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/reject-organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, reason }),
      })

      const data = await response.json()

      if (data.success) {
        setSuccess(true)
        setTimeout(() => {
          onClose()
          window.location.reload()
        }, 1500)
      } else {
        setError(data.error || 'Failed to reject organization')
        setIsLoading(false)
      }
    } catch (err) {
      setError('Failed to connect to server')
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="p-4 text-center">
        <XCircle className="h-12 w-12 text-red-600 mx-auto mb-2" />
        <p className="text-red-600 font-medium">Organization rejected</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
          {error}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="reason">Rejection Reason</Label>
        <textarea
          id="reason"
          className="w-full px-3 py-2 border rounded-md min-h-[100px] text-sm"
          placeholder="Please explain why this organization is being rejected..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          disabled={isLoading}
        />
      </div>
      <div className="text-sm text-muted-foreground">
        The organization will be notified of this decision.
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Rejecting...' : 'Confirm Rejection'}
      </Button>
    </form>
  )
}
