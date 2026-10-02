import { LoginForm } from '@/components/auth/login-form'

export const metadata = { title: 'Log in' }

/** General portal: every role signs in here and is routed to its own landing page. */
export default function LoginPage() {
  return <LoginForm portal="general" />
}
