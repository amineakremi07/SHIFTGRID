import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { OwnerSignupForm } from '@/components/owner-signup-form'

export default function OwnerSignupPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold">
            ShiftGrid
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login-owner">
              <Button variant="ghost">Log In</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 py-12 px-4">
        <div className="container mx-auto max-w-4xl">
          <OwnerSignupForm />
        </div>
      </main>

      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>&copy; 2026 ShiftGrid. All rights reserved.</p>
          <p className="text-sm mt-2">
            Tunisia's premier sports court booking platform
          </p>
        </div>
      </footer>
    </div>
  )
}