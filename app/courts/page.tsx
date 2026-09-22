import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default async function CourtsPage() {
  const cookieStore = await cookies()
  const supabase = await createClient()

  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name, address, city, status')
    .eq('status', 'verified')
    .limit(20)

  const { data: courts } = await supabase
    .from('courts')
    .select('id, org_id, name, sport, price_per_hour, is_active')
    .eq('is_active', true)
    .limit(50)

  return (
    <main className="max-w-6xl mx-auto px-6 py-12">
      <header className="mb-10">
        <h1 className="text-4xl font-extrabold tracking-tight mb-2">Sports Complexes</h1>
        <p className="text-muted-foreground text-lg">Public court availability across Tunisia</p>
      </header>
      <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {(orgs ?? []).map((org: any) => {
          const orgCourts = (courts ?? []).filter((c: any) => c.org_id === org.id)
          return (
            <Card key={org.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-xl leading-tight">{org.name}</CardTitle>
                  <Badge variant="secondary">Verified</Badge>
                </div>
                <CardDescription>
                  {org.address ?? ''}, {org.city ?? ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-4">
                <div className="flex flex-wrap gap-2">
                  {orgCourts.map((c: any) => (
                    <Badge key={c.id} variant="outline" className="text-xs">{c.sport}</Badge>
                  ))}
                  {orgCourts.length === 0 && (
                    <span className="text-xs text-muted-foreground">No active courts listed</span>
                  )}
                </div>
                <div className="mt-auto pt-2">
                  <Link href={`/courts/${org.id}`} passHref>
                    <Button size="sm" className="w-full">View Availability</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </section>
    </main>
  )
}
