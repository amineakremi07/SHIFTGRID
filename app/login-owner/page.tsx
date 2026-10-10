import { LoginForm } from '@/components/auth/login-form'

export const metadata = { title: 'Connexion gestion de club' }

/** Business portal for club owners and staff (platform admins too); players are pointed to /login. */
export default function OwnerLoginPage() {
  return <LoginForm portal="business" />
}
