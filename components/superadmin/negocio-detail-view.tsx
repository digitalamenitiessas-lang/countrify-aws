'use client'

import { useRouter } from 'next/navigation'
import { BusinessDetail } from '@/components/superadmin/shared'
import type { SuperAdminBusinessDetail } from '@/lib/types'

export function NegocioDetailView({ business }: { business: SuperAdminBusinessDetail }) {
  const router = useRouter()
  return <BusinessDetail business={business} onBack={() => router.push('/superadmin/negocios')} />
}
