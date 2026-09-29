import { redirect } from 'next/navigation'

/**
 * Club registration now lives at /register (role choice first). Kept so existing
 * links, bookmarks and emails to /signup-owner keep working.
 */
export default function OwnerSignupRedirect() {
  redirect('/register?role=owner')
}
