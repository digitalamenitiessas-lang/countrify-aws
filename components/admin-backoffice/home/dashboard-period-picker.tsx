'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { PeriodPicker } from '@/components/admin-backoffice/shared/period-picker'

type Props = {
  selectedPeriod: { year: number; month: number }
  availablePeriods: ReadonlyArray<{ year: number; month: number }>
}

export function DashboardPeriodPicker({ selectedPeriod, availablePeriods }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  function handleChange(next: { year: number; month: number } | null) {
    if (!next) return
    if (next.year === selectedPeriod.year && next.month === selectedPeriod.month) return
    const value = `${next.year}-${String(next.month).padStart(2, '0')}`
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('period', value)
    startTransition(() => {
      router.push(`/iadmin?${params.toString()}`, { scroll: false })
    })
  }

  return (
    <div className="inline-flex items-center gap-2">
      <PeriodPicker
        label="Período"
        size="md"
        align="end"
        value={selectedPeriod}
        onChange={handleChange}
        availablePeriods={availablePeriods}
      />
      {pending ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" aria-label="Actualizando" />
      ) : null}
    </div>
  )
}
