import { redirect } from 'next/navigation'

/** Old path; the portal lives at /admin/verification. */
export default function LegacyVerificationsRedirect() {
  redirect('/admin/verification')
}
