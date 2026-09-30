import { requireAdmin } from '@/lib/admin/access'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import type { OrgStatus, Sport } from '@/lib/types/database'

/** The three queues. `pending` is what the brief calls pending_verification. */
export const QUEUE_STATUSES = ['pending', 'approved', 'rejected'] as const
export type QueueStatus = (typeof QUEUE_STATUSES)[number]

export function parseQueueStatus(value: string | undefined): QueueStatus {
  return (QUEUE_STATUSES as readonly string[]).includes(value ?? '') ? (value as QueueStatus) : 'pending'
}

export type VerificationRow = {
  id: string
  name: string
  status: OrgStatus
  city: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  sportTypes: Sport[]
  registryNumber: string | null
  createdAt: string
  reviewedAt: string | null
  rejectionReason: string | null
  hasDocument: boolean
  ownerName: string | null
  ownerEmail: string | null
  ownerPhone: string | null
}

const PAGE_LIMIT = 100

/** Stored document reference: `path` (private bucket) or a legacy public `proof` URL. */
export function documentRef(value: unknown): { path?: string; legacyUrl?: string } {
  if (!value || typeof value !== 'object') return {}
  const v = value as Record<string, unknown>
  return {
    path: typeof v.path === 'string' ? v.path : undefined,
    legacyUrl: typeof v.proof === 'string' ? v.proof : undefined,
  }
}

/**
 * Organizations in one queue, newest review work first for pending (oldest
 * waiting first), most recently decided first for the others. Service role (the
 * owner's email lives in auth.users), so the admin check is done here too.
 */
export async function loadQueue(
  status: QueueStatus
): Promise<{ ok: true; rows: VerificationRow[]; counts: Record<QueueStatus, number> } | { ok: false; message: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  const admin = getSupabaseAdmin()

  const [listRes, ...countRes] = await Promise.all([
    admin
      .from('organizations')
      .select(
        'id, name, status, city, address, latitude, longitude, sport_types, registry_number, created_at, verified_at, rejection_reason, verification_documents'
      )
      .eq('status', status)
      .order(status === 'pending' ? 'created_at' : 'verified_at', { ascending: status === 'pending' })
      .limit(PAGE_LIMIT),
    ...QUEUE_STATUSES.map((s) =>
      admin.from('organizations').select('id', { count: 'exact', head: true }).eq('status', s)
    ),
  ])

  if (listRes.error) {
    console.error('loadQueue failed', { code: listRes.error.code, message: listRes.error.message })
    return { ok: false, message: 'Could not load organizations.' }
  }
  const orgs = listRes.data ?? []
  const counts = Object.fromEntries(QUEUE_STATUSES.map((s, i) => [s, countRes[i].count ?? 0])) as Record<
    QueueStatus,
    number
  >

  // Owner = the org_admin profile of each org; email comes from auth.users.
  const { data: owners } = orgs.length
    ? await admin
        .from('profiles')
        .select('id, org_id, display_name, phone')
        .eq('role', 'org_admin')
        .in(
          'org_id',
          orgs.map((o) => o.id)
        )
    : { data: [] }
  const ownerByOrg = new Map((owners ?? []).map((p) => [p.org_id, p]))

  const emails = new Map<string, string>()
  await Promise.all(
    [...ownerByOrg.values()].map(async (p) => {
      const { data } = await admin.auth.admin.getUserById(p.id)
      if (data.user?.email) emails.set(p.id, data.user.email)
    })
  )

  const rows: VerificationRow[] = orgs.map((o) => {
    const owner = ownerByOrg.get(o.id)
    const doc = documentRef(o.verification_documents)
    return {
      id: o.id,
      name: o.name,
      status: o.status,
      city: o.city,
      address: o.address,
      latitude: o.latitude,
      longitude: o.longitude,
      sportTypes: o.sport_types,
      registryNumber: o.registry_number,
      createdAt: o.created_at,
      reviewedAt: o.verified_at,
      rejectionReason: o.rejection_reason,
      hasDocument: Boolean(doc.path || doc.legacyUrl),
      ownerName: owner?.display_name ?? null,
      ownerEmail: owner ? (emails.get(owner.id) ?? null) : null,
      ownerPhone: owner?.phone ?? null,
    }
  })

  return { ok: true, rows, counts }
}
