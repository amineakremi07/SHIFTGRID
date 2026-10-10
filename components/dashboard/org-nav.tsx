'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, CalendarDays, LayoutGrid, Settings, ShieldCheck, Users } from 'lucide-react'

import { t } from '@/lib/i18n/messages'
import type { MessageKey } from '@/lib/i18n/messages'
import { cn } from '@/lib/utils'

const ITEMS: { href: string; label: MessageKey; icon: typeof Users; ownerOnly: boolean }[] = [
  { href: '/dashboard/org/bookings', label: 'dash.bookings', icon: CalendarDays, ownerOnly: false },
  { href: '/dashboard/org/analytics', label: 'dash.analytics', icon: BarChart3, ownerOnly: true },
  { href: '/dashboard/org/courts', label: 'dash.courts', icon: LayoutGrid, ownerOnly: true },
  { href: '/dashboard/org/settings', label: 'dash.settings', icon: Settings, ownerOnly: true },
  { href: '/dashboard/org/staff', label: 'dash.team', icon: Users, ownerOnly: true },
  { href: '/dashboard/org/settings/security', label: 'dash.security', icon: ShieldCheck, ownerOnly: false },
]

export function OrgNav({ role }: { role: 'org_admin' | 'staff' }) {
  const pathname = usePathname()
  return (
    <nav aria-label={t('dash.nav')} className="flex gap-1 overflow-x-auto">
      {ITEMS.filter((i) => !i.ownerOnly || role === 'org_admin').map(({ href, label, icon: Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-[#f7f5f2] text-[#1d3023]'
                : 'text-[#f7f5f2]/80 hover:bg-[#f7f5f2]/10 hover:text-[#f7f5f2]'
            )}
          >
            <Icon className="size-4" aria-hidden />
            {t(label)}
          </Link>
        )
      })}
    </nav>
  )
}
