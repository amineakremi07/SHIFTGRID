'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export function DateNavigator({
  dateStr,
  onChange,
}: {
  dateStr: string
  onChange: (d: string) => void
}) {
  const [view, setView] = useState<'day' | 'week'>('week')

  const current = new Date(dateStr)
  const prevDay = new Date(current); prevDay.setDate(current.getDate() - 1)
  const nextDay = new Date(current); nextDay.setDate(current.getDate() + 1)

  return (
    <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-card border shadow-sm">
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(prevDay.toISOString().split('T')[0])} aria-label="Previous" className="p-2 rounded-lg hover:bg-muted"><ChevronLeft className="h-4 w-4"/></button>
        <span className="px-3 min-w-[140px] text-center font-semibold text-sm">{current.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}</span>
        <button onClick={() => onChange(nextDay.toISOString().split('T')[0])} aria-label="Next" className="p-2 rounded-lg hover:bg-muted"><ChevronRight className="h-4 w-4"/></button>
      </div>
      <div className="flex gap-1 ml-auto">
        {(['day','week'] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} aria-label={v + ' view'} className={`px-2.5 py-1 text-xs font-medium rounded-md ${view===v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{v}</button>
        ))}
      </div>
    </div>
  )
}
