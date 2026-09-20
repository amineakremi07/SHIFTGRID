'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { UserPlus, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { createStaffInvite } from '@/lib/actions/staff-invites'

/**
 * Staff Invite Form Component
 * Callers: Staff dashboard page, Owner staff management page
 * Affected API: POST /api/staff/invites via createStaffInvite server action
 * Data schemas: inviteSchema (email, role, organization_id) matching inviteStaffSchema
 * User instruction: Build Staff Invite System - Client Components for inviting staff
 */
const inviteSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['org_admin', 'staff'], {
    errorMap: () => ({ message: 'Role must be company_admin or staff' }),
  }),
  organization_id: z.string().uuid('Invalid organization ID'),
})

type InviteFormData = z.infer<typeof inviteSchema>

interface StaffInviteFormProps {
  organizationId: string
  onSuccess?: () => void
}

export function StaffInviteForm({ organizationId, onSuccess }: StaffInviteFormProps) {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      organization_id: organizationId,
      role: 'staff',
    },
  })

  const onSubmit = async (data: InviteFormData) => {
    setIsSubmitting(true)
    setMessage(null)

    try {
      const result = await createStaffInvite(data)

      if (result.success) {
        setMessage({ type: 'success', text: 'Staff invitation sent successfully!' })
        reset()
        onSuccess?.()
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to send invitation' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An unexpected error occurred' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="flex items-center gap-2 text-lg font-semibold mb-4">
        <UserPlus className="h-5 w-5 text-primary" />
        <span>Invite Staff Member</span>
      </div>

      {message && (
        <div
          className={`flex items-center gap-2 p-3 rounded-md ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email Address</Label>
        <Input
          id="email"
          type="email"
          placeholder="staff@company.com"
          {...register('email')}
          disabled={isSubmitting}
          error={!!errors.email}
        />
        {errors.email && (
          <p className="text-sm text-red-600">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        <Controller
          name="role"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
              <SelectTrigger id="role">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">Staff Member</SelectItem>
                <SelectItem value="org_admin">Organization Admin</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        {errors.role && (
          <p className="text-sm text-red-600">{errors.role.message}</p>
        )}
      </div>

      <div className="hidden">
        <Input {...register('organization_id')} />
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <UserPlus className="mr-2 h-4 w-4" />
            Send Invitation
          </>
        )}
      </Button>
    </form>
  )
}