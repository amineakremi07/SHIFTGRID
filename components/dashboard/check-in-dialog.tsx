'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Camera, CheckCircle2, Loader2, ScanLine, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseCheckInInput } from '@/lib/check-in-input'
import { formatVenueTime } from '@/lib/court-time'

export type CheckInOutcome =
  | {
      ok: true
      reference: string
      booker: string
      court: string
      startsAt: string
      endsAt: string
      cashDue: number
      paymentPending: boolean
    }
  | { ok: false; message: string }

/**
 * POST /api/v1/bookings/check-in with whatever the receptionist typed or scanned.
 * Shared by this dialog and the per-booking "Check in" button on the board.
 */
export async function postCheckIn(raw: string): Promise<CheckInOutcome> {
  const key = parseCheckInInput(raw)
  if (!key) return { ok: false, message: 'Enter the 6-digit check-in code, the booking reference or scan the QR code.' }
  const body =
    key.kind === 'code' ? { check_in_code: key.code } : key.kind === 'id' ? { booking_id: key.bookingId } : { reference: key.reference }
  try {
    const res = await fetch('/api/v1/bookings/check-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => null)) as
      | { success: true; data: { reference: string; booker: string; court: string; starts_at: string; ends_at: string; cash_due: number; payment_pending: boolean } }
      | { success: false; error?: string }
      | null
    if (!json) return { ok: false, message: 'Unexpected answer from the server. Please try again.' }
    if (!json.success) return { ok: false, message: json.error ?? 'Check-in failed.' }
    const d = json.data
    return {
      ok: true,
      reference: d.reference,
      booker: d.booker,
      court: d.court,
      startsAt: d.starts_at,
      endsAt: d.ends_at,
      cashDue: d.cash_due,
      paymentPending: d.payment_pending,
    }
  } catch {
    return { ok: false, message: 'We could not reach the server. Please check your connection and try again.' }
  }
}

type BarcodeDetectorLike = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike

const scannerSupported = () =>
  typeof window !== 'undefined' &&
  'BarcodeDetector' in window &&
  typeof navigator !== 'undefined' &&
  Boolean(navigator.mediaDevices?.getUserMedia)

/** Camera QR reader. Needs the browser's BarcodeDetector (Chrome, Edge, Android); others use the code box. */
function QrScanner({ onResult, onProblem }: { onResult: (value: string) => void; onProblem: (message: string) => void }) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  // Keep the latest callbacks without restarting the camera when the parent re-renders.
  const handlers = React.useRef({ onResult, onProblem })
  React.useEffect(() => {
    handlers.current = { onResult, onProblem }
  })

  React.useEffect(() => {
    let stopped = false
    let stream: MediaStream | null = null
    let timer: number | undefined

    const run = async () => {
      try {
        const Detector = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector
        const detector = new Detector({ formats: ['qr_code'] })
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (stopped) return stream.getTracks().forEach((t) => t.stop())
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()

        const tick = async () => {
          if (stopped) return
          try {
            const codes = await detector.detect(video)
            const hit = codes.find((c) => parseCheckInInput(c.rawValue))
            if (hit) {
              stopped = true
              handlers.current.onResult(hit.rawValue)
              return
            }
          } catch {
            // A frame that cannot be read is not an error: try the next one.
          }
          timer = window.setTimeout(tick, 250)
        }
        void tick()
      } catch (e) {
        const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
        handlers.current.onProblem(
          denied ? 'Camera access was blocked. Allow it in the browser, or type the code instead.' : 'The camera could not be started. Type the code instead.'
        )
      }
    }
    void run()

    return () => {
      stopped = true
      if (timer) window.clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className="overflow-hidden rounded-lg bg-black">
      <video ref={videoRef} muted playsInline className="aspect-square w-full object-cover" aria-label="Camera preview for scanning the QR code" />
    </div>
  )
}

export function CheckInDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const [value, setValue] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [scanning, setScanning] = React.useState(false)
  const [outcome, setOutcome] = React.useState<CheckInOutcome | null>(null)
  const canScan = React.useSyncExternalStore(
    () => () => {},
    scannerSupported,
    () => false
  )

  const submit = async (raw: string) => {
    if (busy) return
    setBusy(true)
    setScanning(false)
    const result = await postCheckIn(raw)
    setBusy(false)
    setOutcome(result)
    if (result.ok) {
      setValue('')
      router.refresh()
    }
  }

  const close = (next: boolean) => {
    if (!next) {
      setScanning(false)
      setOutcome(null)
      setValue('')
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="bg-[#eae6df] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Check in a player</DialogTitle>
          <DialogDescription>
            Type the 6-digit code from the player&apos;s email or pass, or scan their QR code. Check-in opens 60 minutes before the slot.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit(value)
          }}
          className="grid gap-3"
          noValidate
        >
          <Label htmlFor="checkin-code">Check-in code or booking reference</Label>
          <div className="flex gap-2">
            <Input
              id="checkin-code"
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                setOutcome(null)
              }}
              placeholder="782910"
              autoComplete="off"
              autoFocus
              inputMode="text"
              className="font-mono text-lg tracking-widest"
              maxLength={60}
            />
            <Button type="submit" disabled={busy || value.trim() === ''} className="bg-[#1d3023] text-[#f7f5f2] hover:bg-[#1d3023]/90">
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />} Check in
            </Button>
          </div>
        </form>

        {canScan && (
          <div className="grid gap-2">
            {scanning ? (
              <>
                <QrScanner
                  onResult={(raw) => void submit(raw)}
                  onProblem={(message) => {
                    setScanning(false)
                    setOutcome({ ok: false, message })
                  }}
                />
                <Button type="button" variant="outline" onClick={() => setScanning(false)}>
                  Stop camera
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOutcome(null)
                  setScanning(true)
                }}
              >
                <ScanLine aria-hidden /> Scan QR code
              </Button>
            )}
          </div>
        )}
        {!canScan && (
          <p className="flex items-center gap-1.5 text-xs text-[#645757]">
            <Camera className="size-3.5" aria-hidden /> This browser cannot scan with the camera. A USB or Bluetooth scanner types into the box above.
          </p>
        )}

        <div aria-live="polite">
          {outcome?.ok && (
            <div className="rounded-lg bg-[#f7f5f2] p-3 text-sm" data-testid="checkin-success">
              <p className="flex items-center gap-1.5 font-semibold text-[#0e634f]">
                <CheckCircle2 className="size-4" aria-hidden /> {outcome.booker} is checked in
              </p>
              <p className="mt-1 text-[#645757]">
                {outcome.court} · {formatVenueTime(outcome.startsAt)}–{formatVenueTime(outcome.endsAt)} ·{' '}
                <span className="font-mono">{outcome.reference}</span>
              </p>
              {outcome.cashDue > 0 && (
                <p className="mt-1 font-medium">Collect {outcome.cashDue.toFixed(2)} TND in cash, then press Mark paid on the schedule.</p>
              )}
              {outcome.paymentPending && <p className="mt-1 font-medium">Payment is still incomplete (online shares). Check with the organiser.</p>}
            </div>
          )}
          {outcome && !outcome.ok && (
            <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-[#f7f5f2] p-3 text-sm text-destructive" data-testid="checkin-error">
              <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {outcome.message}
            </p>
          )}
        </div>

        <DialogFooter className="sm:justify-end">
          <Button type="button" variant="outline" onClick={() => close(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
