import type { IAdminCapability, IAdminContext } from '@/lib/types'
import { can } from '@/lib/auth'

export function CapabilityGate({
  context,
  need,
  administrationId,
  fallback = null,
  children,
}: {
  context: IAdminContext
  need: IAdminCapability
  administrationId?: string
  fallback?: React.ReactNode
  children: React.ReactNode
}) {
  if (!can(context, need, { administrationId })) {
    return <>{fallback}</>
  }
  return <>{children}</>
}
