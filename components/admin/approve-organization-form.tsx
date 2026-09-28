'use client'

import { useState } from 'react'
import { CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ApproveOrganizationForm({ orgId, orgName, onClose }: { orgId: string; orgName: string; onClose: () => void }) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/approve-organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      })

      const data = await response.json()

      if (data.success) {
        setSuccess(true)
        setTimeout(() => {
          onClose()
          window.location.reload()
        }, 1500)
      } else {
        setError(data.error || 'Failed to approve organization')
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
        <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-2" />
        <p className="text-green-600 font-medium">Organization approved successfully</p>
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
      <div className="text-sm text-muted-foreground">
        By approving {orgName}, you will allow them to start using the platform immediately.
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Approving...' : 'Confirm Approval'}
      </Button>
    </form>
  )
}
