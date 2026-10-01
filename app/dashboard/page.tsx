import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login-owner')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/login-owner')
  }

  if (profile.role === 'platform_admin') {
    redirect('/admin/verification')
  }

  if (profile.role === 'org_admin' || profile.role === 'staff') {
    redirect('/dashboard/org/bookings')
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {profile.role}
            </span>
            <form action="/logout" method="post">
              <button type="submit" className="text-sm text-primary hover:underline">
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="container mx-auto py-8 px-4">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="bg-background p-6 rounded-lg border">
            <h3 className="text-lg font-semibold">Total Courts</h3>
            <p className="text-3xl font-bold mt-2">--</p>
            <p className="text-sm text-muted-foreground mt-1">Active courts</p>
          </div>
          <div className="bg-background p-6 rounded-lg border">
            <h3 className="text-lg font-semibold">Pending Bookings</h3>
            <p className="text-3xl font-bold mt-2">--</p>
            <p className="text-sm text-muted-foreground mt-1">Awaiting confirmation</p>
          </div>
          <div className="bg-background p-6 rounded-lg border">
            <h3 className="text-lg font-semibold">Today&apos;s Bookings</h3>
            <p className="text-3xl font-bold mt-2">--</p>
            <p className="text-sm text-muted-foreground mt-1">Scheduled sessions</p>
          </div>
          <div className="bg-background p-6 rounded-lg border">
            <h3 className="text-lg font-semibold">Revenue (This Month)</h3>
            <p className="text-3xl font-bold mt-2">-- TND</p>
            <p className="text-sm text-muted-foreground mt-1">Year to date</p>
          </div>
        </div>

        <div className="mt-8 bg-background p-6 rounded-lg border">
          <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <a
              href="/dashboard/org/staff"
              className="flex flex-col items-center justify-center p-6 border rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <div className="h-12 w-12 mb-3 flex items-center justify-center rounded-full bg-primary/10 text-primary">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <span className="font-medium">Manage Staff</span>
              <span className="text-sm text-muted-foreground mt-1">Invite and manage team</span>
            </a>
            <a
              href="/dashboard/org/bookings"
              className="flex flex-col items-center justify-center p-6 border rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <div className="h-12 w-12 mb-3 flex items-center justify-center rounded-full bg-primary/10 text-primary">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="font-medium">View Bookings</span>
              <span className="text-sm text-muted-foreground mt-1">Calendar and schedule</span>
            </a>
            <a
              href="/dashboard/org/settings"
              className="flex flex-col items-center justify-center p-6 border rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <div className="h-12 w-12 mb-3 flex items-center justify-center rounded-full bg-primary/10 text-primary">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <span className="font-medium">Settings</span>
              <span className="text-sm text-muted-foreground mt-1">Organization settings</span>
            </a>
          </div>
        </div>
      </main>
    </div>
  )
}