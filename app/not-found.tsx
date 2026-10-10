import Link from 'next/link'

import { Button } from '@/components/ui/button'

/** The site-wide 404, in French (Next's built-in one is English). */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Cette page est introuvable</h1>
      <p className="text-sm text-muted-foreground">Le lien est peut-être incorrect, ou la page n&apos;existe plus.</p>
      <Button asChild>
        <Link href="/">Retour à l&apos;accueil</Link>
      </Button>
    </div>
  )
}
