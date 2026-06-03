import { SuperAdminShell } from '@/components/superadmin/shell/superadmin-shell'
import { requireProfile } from '@/lib/auth'

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  await requireProfile(['super_admin'])
  return <SuperAdminShell>{children}</SuperAdminShell>
}
