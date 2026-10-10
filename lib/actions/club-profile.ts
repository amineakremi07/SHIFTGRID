'use server'

import { randomUUID } from 'node:crypto'

import { revalidatePath } from 'next/cache'

import {
  clubProfileSchema,
  GALLERY_BUCKET,
  GALLERY_MAX,
  GALLERY_TYPES,
  galleryPathFromUrl,
  galleryPublicPrefix,
  isOwnGalleryPath,
  validateGalleryFile,
  type ClubProfileInput,
  type GalleryMime,
} from '@/lib/club-profile'
import { reportServerError } from '@/lib/observability'
import { requireOrgAction } from '@/lib/org-access'
import { actionRateLimit } from '@/lib/rate-limit'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'

/**
 * The owner edits the club's public profile. Everything runs with the service role
 * (`org_admin` has no UPDATE on `organizations`, and the bucket has no storage policies)
 * AFTER `requireOrgAction(['org_admin'])`, and always for the caller's own club: the
 * club id comes from the verified session, never from the arguments.
 *
 * Photos: the browser never gets write access to the bucket. `createGalleryUploadUrls`
 * mints one-time signed upload URLs for `<orgId>/<uuid>.<ext>` paths, the browser
 * uploads straight to storage (no size limit from the Server Action body), and
 * `addGalleryImages` then verifies the objects exist before listing them on the profile.
 */

export type ProfileResult =
  | { ok: true }
  | { ok: false; message: string; fieldErrors?: Record<string, string | undefined> }

export type GalleryResult = { ok: true; urls: string[] } | { ok: false; message: string }

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message })

function supabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
}

function refresh(orgId: string) {
  revalidatePath('/dashboard/org/settings')
  revalidatePath(`/courts/${orgId}`)
  revalidatePath('/courts')
  revalidatePath('/')
}

async function currentGallery(orgId: string): Promise<string[] | null> {
  const { data, error } = await getSupabaseAdmin().from('organizations').select('gallery_urls').eq('id', orgId).maybeSingle()
  if (error || !data) return null
  return data.gallery_urls ?? []
}

/** Name, bio, address, city and the map pin. */
export async function saveClubProfile(input: ClubProfileInput): Promise<ProfileResult> {
  const auth = await requireOrgAction(['org_admin'])
  if (!auth.ok) return auth

  const parsed = clubProfileSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string | undefined> = {}
    for (const [key, messages] of Object.entries(parsed.error.flatten().fieldErrors)) fieldErrors[key] = messages?.[0]
    return { ok: false, message: 'Veuillez corriger les champs signalés.', fieldErrors }
  }
  const p = parsed.data

  const { error } = await getSupabaseAdmin()
    .from('organizations')
    .update({
      name: p.name,
      description: p.description,
      whatsapp_number: p.whatsappNumber,
      address: p.address,
      city: p.city,
      latitude: p.latitude,
      longitude: p.longitude,
    })
    .eq('id', auth.ctx.orgId)
  if (error) {
    console.error('saveClubProfile failed', { code: error.code, message: error.message })
    reportServerError('club-profile.save', new Error(`saveClubProfile failed: ${error.code ?? 'unknown'}`), { code: error.code ?? null })
    return fail('Impossible d\'enregistrer le profil. Veuillez réessayer.')
  }

  refresh(auth.ctx.orgId)
  return { ok: true }
}

export type UploadTicket = { path: string; token: string; type: GalleryMime }

/** One signed upload URL per photo the browser is about to upload. */
export async function createGalleryUploadUrls(
  files: { type: string; size: number; name?: string }[]
): Promise<{ ok: true; tickets: UploadTicket[] } | { ok: false; message: string }> {
  const auth = await requireOrgAction(['org_admin'])
  if (!auth.ok) return auth

  const limited = await actionRateLimit('lookup', auth.ctx.userId)
  if (limited) return fail(limited)

  if (!Array.isArray(files) || files.length === 0 || files.length > GALLERY_MAX) return fail(`Choisissez entre 1 et ${GALLERY_MAX} photos.`)
  for (const file of files) {
    const problem = validateGalleryFile(file)
    if (problem) return fail(problem)
  }

  const existing = await currentGallery(auth.ctx.orgId)
  if (existing === null) return fail('Impossible de charger votre galerie. Veuillez réessayer.')
  if (existing.length + files.length > GALLERY_MAX) {
    return fail(`La galerie contient jusqu\'à ${GALLERY_MAX} photos. Vous en avez ${existing.length}, vous pouvez donc en ajouter ${Math.max(0, GALLERY_MAX - existing.length)}.`)
  }

  const storage = getSupabaseAdmin().storage.from(GALLERY_BUCKET)
  const tickets: UploadTicket[] = []
  for (const file of files) {
    const type = file.type as GalleryMime
    const path = `${auth.ctx.orgId}/${randomUUID()}.${GALLERY_TYPES[type]}`
    const { data, error } = await storage.createSignedUploadUrl(path)
    if (error || !data) {
      console.error('createSignedUploadUrl failed', error?.message)
      reportServerError('club-profile.upload-url', new Error('createSignedUploadUrl failed'))
      return fail('Impossible de préparer le téléversement. Veuillez réessayer.')
    }
    tickets.push({ path, token: data.token, type })
  }
  return { ok: true, tickets }
}

/** List photos the browser has just uploaded. Each must exist in this club's folder. */
export async function addGalleryImages(paths: string[]): Promise<GalleryResult> {
  const auth = await requireOrgAction(['org_admin'])
  if (!auth.ok) return auth
  const orgId = auth.ctx.orgId

  if (!Array.isArray(paths) || paths.length === 0 || paths.length > GALLERY_MAX || new Set(paths).size !== paths.length) {
    return fail('Téléversement invalide.')
  }
  if (!paths.every((p) => typeof p === 'string' && isOwnGalleryPath(p, orgId))) return fail('Téléversement invalide.')

  const admin = getSupabaseAdmin()
  const storage = admin.storage.from(GALLERY_BUCKET)

  const checks = await Promise.all(paths.map((p) => storage.exists(p)))
  if (checks.some((c) => c.error || !c.data)) return fail('Une des photos n\'a pas fini d\'être téléversée. Veuillez réessayer.')

  const existing = await currentGallery(orgId)
  if (existing === null) return fail('Impossible de charger votre galerie. Veuillez réessayer.')

  const prefix = galleryPublicPrefix(supabaseUrl(), orgId)
  const added = paths.map((p) => `${prefix}${p.slice(orgId.length + 1)}`)
  const next = [...existing, ...added.filter((u) => !existing.includes(u))]
  if (next.length > GALLERY_MAX) {
    await storage.remove(paths) // do not leave files nobody can see or delete
    return fail(`La galerie contient jusqu\'à ${GALLERY_MAX} photos.`)
  }

  const { error } = await admin.from('organizations').update({ gallery_urls: next }).eq('id', orgId)
  if (error) {
    console.error('addGalleryImages failed', { code: error.code, message: error.message })
    reportServerError('club-profile.gallery-add', new Error(`addGalleryImages failed: ${error.code ?? 'unknown'}`), { code: error.code ?? null })
    await storage.remove(paths)
    return fail('Impossible d\'enregistrer les photos. Veuillez réessayer.')
  }

  refresh(orgId)
  return { ok: true, urls: next }
}

/**
 * Save the gallery as the owner arranged it: this order, minus any photo they removed.
 * It can only reorder or delete the club's CURRENT photos (never add or substitute
 * a URL), and removed photos are also deleted from storage.
 */
export async function saveGallery(orderedUrls: string[]): Promise<GalleryResult> {
  const auth = await requireOrgAction(['org_admin'])
  if (!auth.ok) return auth
  const orgId = auth.ctx.orgId

  if (!Array.isArray(orderedUrls) || orderedUrls.length > GALLERY_MAX || new Set(orderedUrls).size !== orderedUrls.length) {
    return fail('Liste de photos invalide.')
  }
  const existing = await currentGallery(orgId)
  if (existing === null) return fail('Impossible de charger votre galerie. Veuillez réessayer.')
  if (!orderedUrls.every((u) => existing.includes(u))) return fail('Votre galerie a changé dans une autre fenêtre. Rechargez la page et réessayez.')

  const admin = getSupabaseAdmin()
  const { error } = await admin.from('organizations').update({ gallery_urls: orderedUrls }).eq('id', orgId)
  if (error) {
    console.error('saveGallery failed', { code: error.code, message: error.message })
    reportServerError('club-profile.gallery-save', new Error(`saveGallery failed: ${error.code ?? 'unknown'}`), { code: error.code ?? null })
    return fail('Impossible d\'enregistrer la galerie. Veuillez réessayer.')
  }

  const removed = existing
    .filter((u) => !orderedUrls.includes(u))
    .map((u) => galleryPathFromUrl(u, orgId, supabaseUrl()))
    .filter((p): p is string => p !== null)
  if (removed.length) {
    const { error: removeError } = await admin.storage.from(GALLERY_BUCKET).remove(removed)
    if (removeError) console.error('gallery storage cleanup failed', removeError.message) // the profile no longer lists them
  }

  refresh(orgId)
  return { ok: true, urls: orderedUrls }
}
