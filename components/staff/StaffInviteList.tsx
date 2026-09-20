'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Mail, Clock, RefreshCw, Trash2, CheckCircle, AlertCircle, Loader2, UserPlus, Send } from 'lucide-react'
/**
 * Staff Invite List Component
 * Callers: Staff dashboard page, Owner staff management page
 * Affected API: GET /api/staff/invites via listStaffInvites, resendStaffInvite, cancelStaffInvite server actions
 * Data schemas: StaffInvite interface (id, org_id, email, role, token, expires_at, accepted_at, created_at)
 * User instruction: fix the 3 bugs first then hop on next task
 */
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
interface StaffInviteListProps {
  organizationId: string
}

export function StaffInviteList({ organizationId }: StaffInviteListProps) {
  const [invites, setInvites] = useState<StaffInvite[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionStates, setActionStates] = useState<Record<string, 'idle' | 'loading' | 'success' | 'error'>>({})

  const fetchInvites = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await listStaffInvites(organizationId)
      if (result.success) {
        setInvites(result.invites || [])
      } else {
        setError(result.error || 'Failed to load invitations')
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchInvites()
  }, [organizationId])

  const handleResend = async (inviteId: string) => {
    setActionStates(prev => ({ ...prev, [inviteId]: 'loading' }))
    try {
      const result = await resendStaffInvite(inviteId)
      if (result.success) {
        setActionStates(prev => ({ ...prev, [inviteId]: 'success' }))
        fetchInvites()
      } else {
        setActionStates(prev => ({ ...prev, [inviteId]: 'error' }))
      }
    } catch {
      setActionStates(prev => ({ ...prev, [inviteId]: 'error' }))
    }
    // Reset action state after 2 seconds
    setTimeout(() => {
      setActionStates(prev => ({ ...prev, [inviteId]: 'idle' }))
    }, 2000)
  }

  const handleCancel = async (inviteId: string) => {
    if (!confirm('Are you sure you want to cancel this invitation?')) return

    setActionStates(prev => ({ ...prev, [inviteId]: 'loading' }))
    try {
      const result = await cancelStaffInvite(inviteId)
      if (result.success) {
        setActionStates(prev => ({ ...prev, [inviteId]: 'success' }))
        fetchInvites()
      } else {
        setActionStates(prev => ({ ...prev, [inviteId]: 'error' }))
      }
    } catch {
      setActionStates(prev => ({ ...prev, [inviteId]: 'error' }))
    }
    setTimeout(() => {
      setActionStates(prev => ({ ...prev, [inviteId]: 'idle' }))
    }, 2000)
  }

  const getStatusBadge = (invite: StaffInvite) => {
    const now = new Date()
    const expiresAt = new Date(invite.expires_at)

    if (invite.accepted_at) {
      return <Badge variant="success">Accepted</Badge>
    }

    if (expiresAt < now) {
      return <Badge variant="destructive">Expired</Badge>
    }

    return <Badge variant="default">Pending</Badge>
  }

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date()
    const expires = new Date(expiresAt)
    const diff = expires.getTime() - now.getTime()

    if (diff <= 0) return 'Expired'

    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

    if (days > 0) return `${days}d ${hours}h left`
    return `${hours}h left`
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-muted-foreground">Loading invitations...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertCircle className="mx-auto mb-2 h-8 w-8 text-destructive" />
          <p className="text-red-600">{error}</p>
          <Button variant="outline" onClick={fetchInvites} className="mt-4">
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (invites.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Mail className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="text-lg font-medium mb-2">No invitations yet</h3>
          <p className="text-muted-foreground mb-4">
            Invite team members to help manage your courts and bookings.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <CardTitle className="text-lg">Pending Invitations ({invites.length})</CardTitle>
      </div>

      <div className="space-y-3">
        {invites.map((invite) => {
          const state = actionStates[invite.id] || 'idle'
          return (
            <Card key={invite.id} className="border-gray-200">
              <CardContent className="py-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Mail className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{invite.email}</p>
                      <p className="text-sm text-muted-foreground">
                        {invite.role === 'org_admin' ? 'Organization Admin' : 'Staff Member'}
                        {invite.inviter_name && ` • Invited by ${invite.inviter_name}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    {getStatusBadge(invite)}

                    {!invite.accepted_at && new Date(invite.expires_at) > new Date() && (
                      <span className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {getTimeRemaining(invite.expires_at)}
                      </span>
                    )}

                    <div className="flex items-center gap-2">
                      {!invite.accepted_at && new Date(invite.expires_at) > new Date() && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleResend(invite.id)}
                          disabled={state === 'loading'}
                          className="gap-1"
                        >
                          {state === 'loading' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <Send className="h-3 w-3" />
                              Resend
                            </>
                          )}
                        </Button>
                      )}

                      {!invite.accepted_at && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancel(invite.id)}
                          disabled={state === 'loading'}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                        >
                          {state === 'loading' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </Button>
                      )}

                      {invite.accepted_at && (
                        <Badge variant="success" className="gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Accepted
                        </Badge>
                      )}

                      {new Date(invite.expires_at) <= new Date() && !invite.accepted_at && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Expired
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t flex items-center justify-between text-sm text-muted-foreground">
                  <span>Created: {format(new Date(invite.created_at), 'PPp')}</span>
                  <span>Expires: {format(new Date(invite.expires_at), 'PPp')}</span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}