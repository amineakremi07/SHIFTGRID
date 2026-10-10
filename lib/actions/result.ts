import type { z } from 'zod'

/**
 * The one result shape for Server Actions. Not a 'use server' module on purpose: it exports types and
 * plain helpers, which a 'use server' file may not, and the client imports `issuesToFieldErrors`.
 *
 * `error` is a message safe to show to the user. `issues` carries Zod validation problems so a form can
 * mark individual fields; `path[0]` is the field name.
 */
export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string; issues?: z.ZodIssue[] }

export function actionOk(): ActionResult<undefined>
export function actionOk<T>(data: T): ActionResult<T>
export function actionOk<T>(data?: T): ActionResult<T | undefined> {
  return { success: true, data }
}

export function actionFail(error: string, issues?: z.ZodIssue[]): { success: false; error: string; issues?: z.ZodIssue[] } {
  return issues?.length ? { success: false, error, issues } : { success: false, error }
}

/** Failure built from a failed `safeParse`. */
export function actionFailFromZod(error: string, zodError: z.ZodError) {
  return actionFail(error, zodError.issues)
}

/** Group issues by dotted path: `{ 'mon.open': ['Use HH:MM'] }`. */
export function issuesToFieldErrors(issues: readonly z.ZodIssue[] | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const issue of issues ?? []) {
    const key = issue.path.join('.') || '_'
    ;(out[key] ??= []).push(issue.message)
  }
  return out
}
