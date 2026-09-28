import { createPublicClient } from '@/lib/supabase/public'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

// Public data read with the anon role: never prerender it with build-time rows.
export const dynamic = 'force-dynamic'

export default async function CourtsPage() {
  const supabase = createPublicClient()

  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name, address, city, status')
    .eq('status', 'approved')
    .limit(20)

  const { data: courts } = await supabase
    .from('courts')
    .select('id, org_id, name, sport, price_per_hour, status')
    .eq('status', 'active')
    .limit(50)

  return (
    <main className="max-w-6xl mx-auto px-6 py-12">
      <header className="mb-10">
        <h1 className="text-4xl font-extrabold tracking-tight mb-2">Sports Complexes</h1>
        <p className="text-muted-foreground text-lg">Public court availability across Tunisia</p>
      </header>
      <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {(orgs ?? []).map((org) => {
          const orgCourts = (courts ?? []).filter((c) => c.org_id === org.id)
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
                  {orgCourts.map((c) => (
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
