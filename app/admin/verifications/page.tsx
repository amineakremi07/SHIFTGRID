import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPendingVerifications } from '@/lib/actions/admin-verification'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar, CheckCircle } from 'lucide-react'
import { OrganizationActionsClient } from '@/app/admin/verifications/actions'

export const dynamic = 'force-dynamic'

export default async function AdminVerificationsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login-owner')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'platform_admin') {
    redirect('/dashboard')
  }

  const { organizations, error } = await getPendingVerifications()

  if (error) {
    console.error('Error loading verifications:', error)
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-xl font-bold">Admin Dashboard - Verifications</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Platform Admin</span>
            <form action="/logout" method="post">
              <Button variant="outline" size="sm" type="submit">
                Sign Out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold">Pending Organization Verifications</h2>
          <Badge className="bg-secondary text-secondary-foreground">
            {organizations?.length || 0} pending
          </Badge>
        </div>

        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md text-destructive mb-6">
            Error loading verifications: {error}
          </div>
        )}

        {organizations && organizations.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {organizations.map((org: any) => (
              <OrganizationCard key={org.id} organization={org} />
            ))}
          </div>
        ) : (
          <div className="bg-background rounded-lg border p-12 text-center">
            <CheckCircle className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold">No Pending Verifications</h3>
            <p className="text-muted-foreground mt-2">
              All organizations have been reviewed
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

function OrganizationCard({ organization }: { organization: any }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-muted/30">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{organization.name}</CardTitle>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>{new Date(organization.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          <Badge className="bg-yellow-50 text-yellow-700 border border-yellow-200">
            Pending
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <OrganizationActions orgId={organization.id} orgName={organization.name} />
      </CardContent>
    </Card>
  )
}

function OrganizationActions({ orgId, orgName }: { orgId: string; orgName: string }) {
  return <OrganizationActionsClient orgId={orgId} orgName={orgName} />
}
