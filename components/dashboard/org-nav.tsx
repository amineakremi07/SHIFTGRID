'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, CalendarDays, LayoutGrid, Settings, Users } from 'lucide-react'

import { cn } from '@/lib/utils'

const ITEMS = [
  { href: '/dashboard/org/bookings', label: 'Bookings', icon: CalendarDays, ownerOnly: false },
  { href: '/dashboard/org/analytics', label: 'Analytics', icon: BarChart3, ownerOnly: true },
  { href: '/dashboard/org/courts', label: 'Courts', icon: LayoutGrid, ownerOnly: true },
  { href: '/dashboard/org/settings', label: 'Settings', icon: Settings, ownerOnly: true },
  { href: '/dashboard/org/staff', label: 'Team', icon: Users, ownerOnly: true },
]

export function OrgNav({ role }: { role: 'org_admin' | 'staff' }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Club dashboard" className="flex gap-1 overflow-x-auto">
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
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
