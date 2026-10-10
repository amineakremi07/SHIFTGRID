import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'

export const metadata = { title: 'Mot de passe oublié', robots: { index: false, follow: false } }

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />
}
