'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { switchOrganizationAction } from '@/lib/actions/org-switch'

export type SwitcherItem = {
  orgId: string
  name: string
  role: 'org_admin' | 'staff' | 'platform_admin'
  status: string
}

const ROLE_LABEL = { org_admin: 'Owner', staff: 'Staff', platform_admin: 'Platform admin' } as const

/**
 * "Which organization am I acting as?" Rendered ONLY for an account that is explicitly a
 * member of several organizations (the server decides and passes `items`). Choosing one
 * makes it the active organization on the server, then opens that club's dashboard
 * (or the platform admin area for the platform context).
 */
export function OrgSwitcher({ items, activeOrgId }: { items: SwitcherItem[]; activeOrgId: string | null }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [busy, setBusy] = React.useState(false)

  if (items.length < 2) return null // defence in depth: never a one-entry menu

  const choose = (orgId: string) => {
    if (orgId === activeOrgId || busy) return
    setBusy(true)
    startTransition(async () => {
      const result = await switchOrganizationAction(orgId)
      if (!result.ok) {
        setBusy(false)
        toast.error(result.message)
        return
      }
      router.push(result.path)
      router.refresh()
      setBusy(false)
    })
  }

  const loading = busy || pending

  return (
    <div data-testid="org-switcher" className="flex items-center gap-1.5">
      <label htmlFor="org-switcher-trigger" className="sr-only">
        Switch organization
      </label>
      <Select value={activeOrgId ?? ''} onValueChange={choose} disabled={loading}>
        <SelectTrigger
          id="org-switcher-trigger"
          size="sm"
          aria-label="Switch organization"
          className="min-w-44 max-w-64 border-[#f7f5f2]/30 bg-[#f7f5f2]/10 text-[#f7f5f2] hover:bg-[#f7f5f2]/20 dark:bg-[#f7f5f2]/10"
        >
          {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Building2 aria-hidden />}
          <SelectValue placeholder="Choose an organization" />
        </SelectTrigger>
        <SelectContent align="end">
          {items.map((item) => (
            <SelectItem key={item.orgId} value={item.orgId}>
              <span className="flex items-center gap-1.5">
                {item.role === 'platform_admin' && <ShieldCheck className="size-3.5" aria-hidden />}
                {item.role === 'platform_admin' ? 'Platform admin' : item.name}
                {item.role !== 'platform_admin' && <span className="text-xs text-muted-foreground">· {ROLE_LABEL[item.role]}</span>}
                {item.role !== 'platform_admin' && item.status !== 'approved' && <span className="text-xs text-muted-foreground">· {item.status}</span>}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
