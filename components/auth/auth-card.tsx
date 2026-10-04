import { BrandMark } from '@/components/brand/brand-mark'

/** The centred card the sign-in pages use, shared by the password-recovery pages. */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark tone="dark" imageClassName="h-12" />
          <h1 className="mt-6 text-2xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="rounded-lg border bg-background p-6">{children}</div>
      </div>
    </div>
  )
}
