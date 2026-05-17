import { IAdminShell } from '@/components/admin-backoffice/shell/iadmin-shell'
import { requireIAdmin } from '@/lib/auth'

export default async function IAdminLayout({ children }: { children: React.ReactNode }) {
  const { context } = await requireIAdmin()
  return <IAdminShell context={context}>{children}</IAdminShell>
}
