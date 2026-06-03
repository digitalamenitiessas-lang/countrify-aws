'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BusinessesList } from '@/components/superadmin/shared'
import { createBusinessWithAdmin } from '@/app/superadmin/actions'
import type { SuperAdminBusinessDetail } from '@/lib/types'

export function NegociosView({ businesses }: { businesses: SuperAdminBusinessDetail[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [businessDraft, setBusinessDraft] = useState({
    businessName: '',
    category: '',
    description: '',
    address: '',
    adminFullName: '',
    adminEmail: '',
    adminPhone: '',
    adminPassword: 'Countrify2026!',
  })

  function submitBusiness(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(async () => {
      try {
        await createBusinessWithAdmin({
          businessName: businessDraft.businessName,
          category: businessDraft.category,
          description: businessDraft.description,
          address: businessDraft.address || null,
          adminFullName: businessDraft.adminFullName,
          adminEmail: businessDraft.adminEmail,
          adminPhone: businessDraft.adminPhone || null,
          adminPassword: businessDraft.adminPassword,
        })
        toast.success('Negocio y administrador creados')
        setBusinessDraft({
          businessName: '',
          category: '',
          description: '',
          address: '',
          adminFullName: '',
          adminEmail: '',
          adminPhone: '',
          adminPassword: 'Countrify2026!',
        })
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  return (
    <div>
      <form onSubmit={submitBusiness} className="glass-card rounded-xl p-5 mb-5">
        <div className="mb-4">
          <h3 className="font-semibold text-foreground text-sm">Crear negocio con administrador</h3>
          <p className="text-xs text-muted-foreground mt-0.5">El negocio queda listo con un usuario `negocio_admin` asociado.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" placeholder="Nombre negocio" value={businessDraft.businessName} onChange={(e) => setBusinessDraft({ ...businessDraft, businessName: e.target.value })} required />
          <input className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" placeholder="Categoria" value={businessDraft.category} onChange={(e) => setBusinessDraft({ ...businessDraft, category: e.target.value })} required />
          <input className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" placeholder="Direccion" value={businessDraft.address} onChange={(e) => setBusinessDraft({ ...businessDraft, address: e.target.value })} />
          <input className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" placeholder="Descripcion" value={businessDraft.description} onChange={(e) => setBusinessDraft({ ...businessDraft, description: e.target.value })} />
          <input className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" placeholder="Nombre admin" value={businessDraft.adminFullName} onChange={(e) => setBusinessDraft({ ...businessDraft, adminFullName: e.target.value })} required />
          <input className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" placeholder="Email admin" type="email" value={businessDraft.adminEmail} onChange={(e) => setBusinessDraft({ ...businessDraft, adminEmail: e.target.value })} required />
          <input className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" placeholder="Telefono admin" value={businessDraft.adminPhone} onChange={(e) => setBusinessDraft({ ...businessDraft, adminPhone: e.target.value })} />
          <input className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" placeholder="Password temporal" value={businessDraft.adminPassword} onChange={(e) => setBusinessDraft({ ...businessDraft, adminPassword: e.target.value })} required />
          <button type="submit" disabled={pending} className="md:col-span-4 rounded-lg px-4 py-2 text-sm font-semibold text-white btn-premium">
            {pending ? 'Creando...' : 'Crear negocio y admin'}
          </button>
        </div>
      </form>
      <BusinessesList businesses={businesses} onSelect={(business) => router.push(`/superadmin/negocios/${business.id}`)} />
    </div>
  )
}
