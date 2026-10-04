'use client'

import * as React from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Eye, ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { addGalleryImages, createGalleryUploadUrls, saveGallery } from '@/lib/actions/club-profile'
import { GALLERY_BUCKET, GALLERY_MAX, GALLERY_TYPES, validateGalleryFile } from '@/lib/club-profile'
import { GALLERY_MAX_RAW_BYTES, prepareGalleryImage } from '@/lib/image-resize'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

/**
 * The club's photo gallery: upload several images at once, preview, reorder (the first
 * photo is the cover) and delete. Reordering and deleting save at once; a failed save
 * puts the old order back. Uploads go straight from the browser to Storage with
 * one-time signed URLs (see lib/actions/club-profile.ts), so there is no size limit
 * from the Server Action body and the bucket has no client write policy.
 */
export function GalleryManager({ initialUrls }: { initialUrls: string[] }) {
  const router = useRouter()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [urls, setUrls] = React.useState(initialUrls)
  const [busy, setBusy] = React.useState<null | 'uploading' | 'saving'>(null)
  const [progress, setProgress] = React.useState('')
  const [dragOver, setDragOver] = React.useState(false)
  const [preview, setPreview] = React.useState<string | null>(null)
  const [toDelete, setToDelete] = React.useState<string | null>(null)

  const room = GALLERY_MAX - urls.length

  const upload = async (chosen: File[]) => {
    let picked = chosen
    if (picked.length === 0 || busy) return
    if (picked.length > room) {
      toast.error(room > 0 ? `You can add ${room} more photo${room === 1 ? '' : 's'} (the gallery holds ${GALLERY_MAX}).` : `The gallery is full (${GALLERY_MAX} photos). Delete one first.`)
      return
    }
    // Type first (cheap), then shrink big phone photos in the browser, then check the 5 MB cap.
    for (const file of picked) {
      const problem = validateGalleryFile({ type: file.type, size: Math.min(file.size, 1), name: file.name })
      if (problem) return void toast.error(problem)
      if (file.size > GALLERY_MAX_RAW_BYTES) return void toast.error(`${file.name} is too large (30 MB maximum).`)
    }

    setBusy('uploading')
    try {
      setProgress('Optimising photos…')
      const files = await Promise.all(picked.map(prepareGalleryImage))
      for (const file of files) {
        const problem = validateGalleryFile(file)
        if (problem) return void toast.error(problem)
      }
      picked = files

      setProgress('Preparing…')
      const prepared = await createGalleryUploadUrls(picked.map((f) => ({ type: f.type, size: f.size, name: f.name })))
      if (!prepared.ok) return void toast.error(prepared.message)

      const storage = createClient().storage.from(GALLERY_BUCKET)
      const uploaded: string[] = []
      for (const [i, ticket] of prepared.tickets.entries()) {
        setProgress(`Uploading ${i + 1} of ${picked.length}…`)
        const { error } = await storage.uploadToSignedUrl(ticket.path, ticket.token, picked[i], { contentType: picked[i].type })
        if (error) {
          toast.error(`Could not upload ${picked[i].name}. Please try again.`)
          break
        }
        uploaded.push(ticket.path)
      }
      if (uploaded.length === 0) return

      setProgress('Saving…')
      const saved = await addGalleryImages(uploaded)
      if (!saved.ok) return void toast.error(saved.message)
      setUrls(saved.urls)
      toast.success(`${uploaded.length} photo${uploaded.length === 1 ? '' : 's'} added`)
      router.refresh()
    } catch {
      toast.error('The upload failed. Please check your connection and try again.')
    } finally {
      setBusy(null)
      setProgress('')
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const commit = async (next: string[], success?: string) => {
    const before = urls
    setUrls(next) // optimistic
    setBusy('saving')
    const result = await saveGallery(next)
    setBusy(null)
    if (!result.ok) {
      setUrls(before)
      toast.error(result.message)
      return false
    }
    setUrls(result.urls)
    if (success) toast.success(success)
    router.refresh()
    return true
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= urls.length) return
    const next = [...urls]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    void commit(next)
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    const ok = await commit(urls.filter((u) => u !== toDelete), 'Photo deleted')
    if (ok) setToDelete(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-[#645757]">
          Up to {GALLERY_MAX} photos (JPG, PNG or WebP, 5 MB each). The first photo is the cover players see first.
        </p>
        <span className="text-sm font-medium tabular-nums" data-testid="gallery-count">
          {urls.length} / {GALLERY_MAX}
        </span>
      </div>

      <label
        htmlFor="gallery-files"
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          void upload(Array.from(e.dataTransfer.files))
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[#d7d2cc] bg-[#f7f5f2] px-4 py-8 text-center text-sm transition-colors hover:border-[#1d3023]',
          dragOver && 'border-[#1d3023] bg-[#eae6df]',
          (room <= 0 || busy) && 'pointer-events-none opacity-60'
        )}
      >
        {busy === 'uploading' ? <Loader2 className="size-6 animate-spin" aria-hidden /> : <ImagePlus className="size-6" aria-hidden />}
        <span className="font-medium">{busy === 'uploading' ? progress : 'Drop photos here or click to choose several'}</span>
        <span className="text-xs text-[#645757]">{room > 0 ? `${room} more allowed` : 'The gallery is full'}</span>
        <input
          ref={inputRef}
          id="gallery-files"
          type="file"
          multiple
          accept={Object.keys(GALLERY_TYPES).join(',')}
          className="sr-only"
          disabled={room <= 0 || busy !== null}
          onChange={(e) => void upload(Array.from(e.target.files ?? []))}
        />
      </label>

      {urls.length === 0 ? (
        <p className="rounded-lg bg-[#f7f5f2] px-4 py-6 text-center text-sm text-[#645757]">No photos yet. Clubs with photos get more bookings.</p>
      ) : (
        <ul className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4', busy === 'saving' && 'opacity-70')} data-testid="gallery-grid">
          {urls.map((url, i) => (
            <li key={url} className="overflow-hidden rounded-lg bg-[#f7f5f2]" data-testid="gallery-item">
              <div className="relative aspect-[4/3]">
                {/* Served straight from the storage CDN (photos are downscaled before upload), no image proxy in between. */}
                <Image src={url} alt={`Gallery photo ${i + 1}`} fill unoptimized sizes="(min-width: 1024px) 220px, 45vw" className="object-cover" />
                {i === 0 && (
                  <span className="absolute left-1.5 top-1.5 rounded-sm bg-[#1d3023] px-1.5 py-0.5 text-[11px] font-medium text-[#f7f5f2]">Cover</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-1 p-1.5">
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Move photo ${i + 1} earlier`}
                    disabled={i === 0 || busy !== null}
                    onClick={() => move(i, i - 1)}
                  >
                    <ArrowLeft aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Move photo ${i + 1} later`}
                    disabled={i === urls.length - 1 || busy !== null}
                    onClick={() => move(i, i + 1)}
                  >
                    <ArrowRight aria-hidden />
                  </Button>
                </div>
                <div className="flex gap-1">
                  <Button type="button" variant="outline" size="icon-sm" aria-label={`Preview photo ${i + 1}`} onClick={() => setPreview(url)}>
                    <Eye aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon-sm"
                    aria-label={`Delete photo ${i + 1}`}
                    disabled={busy !== null}
                    onClick={() => setToDelete(url)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={preview !== null} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="bg-[#eae6df] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Photo preview</DialogTitle>
            <DialogDescription>This is how the photo looks on your public page.</DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg bg-black/5">
              <Image src={preview} alt="Gallery photo preview" fill unoptimized sizes="(min-width: 768px) 700px, 95vw" className="object-contain" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={toDelete !== null} onOpenChange={(o) => !o && busy === null && setToDelete(null)}>
        <DialogContent className="bg-[#eae6df] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this photo?</DialogTitle>
            <DialogDescription>It disappears from your public page and is deleted for good.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setToDelete(null)} disabled={busy !== null}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busy !== null}>
              {busy === 'saving' && <Loader2 className="animate-spin" aria-hidden />}
              Delete photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
