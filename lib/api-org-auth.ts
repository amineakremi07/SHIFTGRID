import { NextRequest, NextResponse } from 'next/server'

import { validateApiKey } from '@/lib/middleware/api-auth'
import { getOrgAccess } from '@/lib/org-access'

/**
 * Who is calling a club-scoped `/api/v1` route, and for which club.
 *  - `Authorization: Bearer sg_live_...`: an API key with the 'write' permission; the club is the key's.
 *  - otherwise the dashboard session of an owner or staff member of an APPROVED club; the club
 *    is the caller's own (their profile), and the request must be JSON, which a cross-site
 *    HTML form cannot send (so cookie auth is not forgeable that way).
 * The club NEVER comes from the request body, so one club cannot act on another's data.
 * Returns the club id, or the ready-made error response.
 */
export const apiFail = (error: string, status: number, code?: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ success: false, error, ...(code ? { code } : {}), ...extra }, { status })

export async function resolveApiOrg(request: NextRequest): Promise<{ orgId: string } | NextResponse> {
  if (request.headers.get('authorization')) {
    const key = await validateApiKey(request)
    if (!key.valid || !key.organizationId) return apiFail(key.error || 'Unauthorized', 401)
    const perms = key.permissions ?? []
    if (!perms.includes('write') && !perms.includes('admin')) return apiFail('Write permission required', 403)
    return { orgId: key.organizationId }
  }

  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return apiFail('Content-Type must be application/json', 415)
  }
  const access = await getOrgAccess()
  if (access.kind === 'signed_out') return apiFail('Please sign in again.', 401)
  if (access.kind !== 'ok') return apiFail('You do not have access to a club dashboard.', 403)
  if (access.ctx.orgStatus !== 'approved') return apiFail('Your club is not approved yet.', 403)
  return { orgId: access.ctx.orgId }
}

/** A JSON object body, or null when it is missing, malformed, an array or a scalar. */
export async function readJsonObject(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const parsed = await request.json()
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}
