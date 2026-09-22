import { Badge } from '@/components/ui/badge'

export type SlotState = 'available' | 'occupied' | 'locked_buffer' | 'past'

export const SlotStateBadge = ({ state }: { state: SlotState }) => {
  const styles = {
    available: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200',
    occupied: 'bg-rose-100 text-rose-800 hover:bg-rose-200',
    locked_buffer: 'bg-amber-100 text-amber-800 hover:bg-amber-200',
    past: 'bg-slate-100 text-slate-500 hover:bg-slate-200',
  }
  const labels = {
    available: 'Available',
    occupied: 'Occupied',
    locked_buffer: 'Locked + Buffer',
    past: 'Past',
  }
  return <Badge className={`${styles[state]} border-none font-medium text-xs`} variant="outline">{labels[state]}</Badge>
}
