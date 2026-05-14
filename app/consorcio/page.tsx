import { redirect } from 'next/navigation'
import { SetupNotice } from '@/components/setup-notice'
import { getCurrentProfile } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase/env'

export default async function ConsorcioPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-background pt-16">
        <SetupNotice />
      </div>
    )
  }

  const profile = await getCurrentProfile()
  if (!profile) {
    redirect('/login')
  }

  if (profile.role === 'propietario') {
    redirect('/propietario')
  }

  if (profile.role === 'consorcio_admin' || profile.role === 'super_admin') {
    redirect('/iadmin')
  }

  redirect('/')
}
