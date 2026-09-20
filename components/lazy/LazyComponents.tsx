'use client'

import { lazy, Suspense, ComponentType } from 'react'
import { Loader2, Calendar, Users, Settings, BarChart3, CreditCard } from 'lucide-react'

/**
 * Lazy-loaded components for code splitting
 * Each component is loaded only when needed
 * Callers: Page components, layout components, dashboard pages
 * Affected API: Next.js code splitting, React.lazy, Suspense boundaries
 * Data schemas: None - these are React component definitions
 */

// Admin dashboard components
export const AdminDashboard = lazy(() => import('@/components/admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })))
export const AdminOrganizations = lazy(() => import('@/components/admin/AdminOrganizations').then(m => ({ default: m.AdminOrganizations })))
export const AdminAnalytics = lazy(() => import('@/components/admin/AdminAnalytics').then(m => ({ default: m.AdminAnalytics })))
export const AdminSettings = lazy(() => import('@/components/admin/AdminSettings').then(m => ({ default: m.AdminSettings })))

// Owner dashboard components
export const OwnerDashboard = lazy(() => import('@/components/owner/OwnerDashboard').then(m => ({ default: m.OwnerDashboard })))
export const OwnerCourts = lazy(() => import('@/components/owner/OwnerCourts').then(m => ({ default: m.OwnerCourts })))
export const OwnerBookings = lazy(() => import('@/components/owner/OwnerBookings').then(m => ({ default: m.OwnerBookings })))
export const OwnerStaff = lazy(() => import('@/components/owner/OwnerStaff').then(m => ({ default: m.OwnerStaff })))
export const OwnerAnalytics = lazy(() => import('@/components/owner/OwnerAnalytics').then(m => ({ default: m.OwnerAnalytics })))
export const OwnerBilling = lazy(() => import('@/components/owner/OwnerBilling').then(m => ({ default: m.OwnerBilling })))
export const OwnerSettings = lazy(() => import('@/components/owner/OwnerSettings').then(m => ({ default: m.OwnerSettings })))

// Staff components
export const StaffDashboard = lazy(() => import('@/components/staff/StaffDashboard').then(m => ({ default: m.StaffDashboard })))
export const StaffBookings = lazy(() => import('@/components/staff/StaffBookings').then(m => ({ default: m.StaffBookings })))
export const StaffCourts = lazy(() => import('@/components/staff/StaffCourts').then(m => ({ default: m.StaffCourts })))

// Player components
export const PlayerDashboard = lazy(() => import('@/components/player/PlayerDashboard').then(m => ({ default: m.PlayerDashboard })))
export const PlayerBookings = lazy(() => import('@/components/player/PlayerBookings').then(m => ({ default: m.PlayerBookings })))
export const PlayerCourts = lazy(() => import('@/components/player/PlayerCourts').then(m => ({ default: m.PlayerCourts })))
export const PlayerProfile = lazy(() => import('@/components/player/PlayerProfile').then(m => ({ default: m.PlayerProfile })))

// UI components
export const CalendarPicker = lazy(() => import('@/components/ui/CalendarPicker').then(m => ({ default: m.CalendarPicker })))
export const CourtMap = lazy(() => import('@/components/ui/CourtMap').then(m => ({ default: m.CourtMap })))
export const BookingForm = lazy(() => import('@/components/ui/BookingForm').then(m => ({ default: m.BookingForm })))
export const DocumentViewer = lazy(() => import('@/components/ui/DocumentViewer').then(m => ({ default: m.DocumentViewer })))
export const RichTextEditor = lazy(() => import('@/components/ui/RichTextEditor').then(m => ({ default: m.RichTextEditor })))

/**
 * Loading fallback component
 */
interface LoadingFallbackProps {
  message?: string
  icon?: ComponentType<{ className?: string }>
}

export function LoadingFallback({ message = 'Loading...', icon: Icon = Loader2 }: LoadingFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 gap-4">
      <Icon className="h-8 w-8 animate-spin text-primary" />
      <p className="text-muted-foreground">{message}</p>
    </div>
  )
}

/**
 * Predefined loading fallbacks for different sections
 */
export const AdminLoading = () => <LoadingFallback message="Loading admin dashboard..." icon={Settings} />
export const OwnerLoading = () => <LoadingFallback message="Loading owner dashboard..." icon={Calendar} />
export const StaffLoading = () => <LoadingFallback message="Loading staff dashboard..." icon={Users} />
export const AnalyticsLoading = () => <LoadingFallback message="Loading analytics..." icon={BarChart3} />
export const BillingLoading = () => <LoadingFallback message="Loading billing..." icon={CreditCard} />
export const CalendarLoading = () => <LoadingFallback message="Loading calendar..." icon={Calendar} />
export const MapLoading = () => <LoadingFallback message="Loading map..." icon={Loader2} />

/**
 * Wrapper for lazy components with consistent Suspense boundaries
 */
interface LazyWrapperProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function LazyWrapper({ children, fallback = <LoadingFallback /> }: LazyWrapperProps) {
  return <Suspense fallback={fallback}>{children}</Suspense>
}

/**
 * Preload a lazy component (call on hover/focus for faster navigation)
 */
export function preloadComponent(importFn: () => Promise<{ default: ComponentType<any> }>) {
  importFn()
}

/**
 * Hook to preload components on user interaction
 */
export function usePreload() {
  const preloadMap = {
    admin: () => import('@/components/admin/AdminDashboard'),
    owner: () => import('@/components/owner/OwnerDashboard'),
    staff: () => import('@/components/staff/StaffDashboard'),
    player: () => import('@/components/player/PlayerDashboard'),
    calendar: () => import('@/components/ui/CalendarPicker'),
    map: () => import('@/components/ui/CourtMap'),
  }

  const preload = (key: keyof typeof preloadMap) => {
    preloadMap[key]()
  }

  return { preload }
}