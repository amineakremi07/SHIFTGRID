import { CourtSlotMatrix } from '@/components/courts/court-slot-matrix'

/**
 * Design preview for the court slot matrix (Milestone 3).
 *
 * Renders the matrix on its built-in mock data — no Supabase required — so the
 * component can be reviewed before Realtime wiring. Safe to delete once the
 * matrix is wired into `/courts/[orgId]`.
 */
export default function CourtMatrixPreviewPage() {
  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-14">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Milestone 3 · Preview
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Court Slot Matrix
        </h1>
        <p className="mt-2 max-w-[60ch] text-muted-foreground">
          Running on mock data. Switch sports to see the shared-layout tab
          indicator, and select an available slot to see the selection state.
        </p>
      </header>

      <CourtSlotMatrix />
    </main>
  )
}
