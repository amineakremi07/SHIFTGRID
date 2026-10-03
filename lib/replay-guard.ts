import { replayAllowed } from '@/lib/consent'

/**
 * Stops a PostHog session recording BEFORE a client-side navigation into a page that must
 * never be recorded (lib/consent.ts `replayAllowed`). Called from `onRouterTransitionStart`
 * in instrumentation-client.ts, which Next.js runs when a navigation is dispatched, before the
 * URL changes or the new route renders. Stopping later (in a React effect) is too late: the
 * recorder has already captured the URL change and the new page's DOM by then (verified in a
 * headless run). The provider restarts recording after the move when the new page is allowed.
 */
type Recorder = { sessionRecordingStarted(): boolean; stopSessionRecording(): void }

let recorder: Recorder | null = null

/** The provider registers PostHog once it is loaded (and only after consent). */
export function registerRecorder(next: Recorder | null): void {
  recorder = next
}

export function pauseRecordingBeforeNavigation(url: string): void {
  if (!recorder) return
  let path = url
  try {
    path = new URL(url, window.location.origin).pathname
  } catch {
    /* keep the raw value: replayAllowed() also strips ?query and #hash */
  }
  try {
    if (!replayAllowed(path) && recorder.sessionRecordingStarted()) recorder.stopSessionRecording()
  } catch {
    // Analytics must never break navigation.
  }
}
