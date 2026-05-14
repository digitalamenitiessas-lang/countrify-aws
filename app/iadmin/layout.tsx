import { SetupNotice } from '@/components/setup-notice'
import { IAdminShell } from '@/components/admin-backoffice/shell/iadmin-shell'
import { requireIAdmin } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase/env'

export default async function IAdminLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-background pt-16">
        <SetupNotice />
      </div>
    )
  }

  const { context } = await requireIAdmin()

  return <IAdminShell context={context}>{children}</IAdminShell>
}
