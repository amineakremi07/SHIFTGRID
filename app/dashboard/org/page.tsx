import { redirect } from 'next/navigation'

export default function OrgDashboardIndex() {
  redirect('/dashboard/org/bookings')
}
