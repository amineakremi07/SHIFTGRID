import Link from 'next/link'

import { DiscoveryHub } from '@/components/home/discovery-hub'
import { HeroSection } from '@/components/home/hero-section'
import { HowItWorks } from '@/components/home/how-it-works'

export default function Home() {
  return (
    <>
      <main className="flex-1">
        <HeroSection />
        <DiscoveryHub />
        <HowItWorks />
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-muted-foreground">
          <p>&copy; 2026 ShiftGrid. Sports court booking in Tunisia.</p>
          <nav aria-label="Footer" className="flex gap-6">
            <Link href="/courts" className="hover:text-foreground">
              Courts
            </Link>
            <Link href="/signup-owner" className="hover:text-foreground">
              List your complex
            </Link>
          </nav>
        </div>
      </footer>
    </>
  )
}
