import { ResetPasswordForm } from '@/components/auth/reset-password-form'

/** The emailed link lands here with a one-time code in the address: never indexed, never leaked by referrer. */
export const metadata = { title: 'Reset password', robots: { index: false, follow: false }, referrer: 'no-referrer' as const }

export default function ResetPasswordPage() {
  return <ResetPasswordForm />
}
