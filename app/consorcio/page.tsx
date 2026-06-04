import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth'

export default async function ConsorcioPage() {
  const profile = await getCurrentProfile()
  if (!profile) {
    redirect('/login')
  }

  if (profile.role === 'vecino') {
    redirect('/vecino')
  }

  if (profile.role === 'consorcio_admin' || profile.role === 'super_admin') {
    redirect('/iadmin')
  }

  redirect('/')
}
