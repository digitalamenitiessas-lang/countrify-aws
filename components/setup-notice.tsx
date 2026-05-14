import Link from 'next/link'
import { AlertTriangle, DatabaseZap } from 'lucide-react'

export function SetupNotice({
  title = 'Configura Supabase para habilitar esta vista',
  description = 'Countrify ya esta preparado para usar Supabase, pero faltan las variables de entorno del proyecto o la migracion SQL.',
}: {
  title?: string
  description?: string
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-16">
      <div className="glass-card rounded-2xl p-8 max-w-2xl w-full">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(17, 34, 80,0.14), rgba(10, 24, 56,0.18))' }}>
            <DatabaseZap className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="font-serif text-2xl font-bold text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 text-sm text-muted-foreground space-y-2">
          <p>1. Completa `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`.</p>
          <p>2. Ejecuta todas las migraciones SQL de `supabase/migrations/` en orden.</p>
          <p>3. Crea usuarios y ajusta sus roles en `profiles` para probar cada panel.</p>
        </div>

        <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="w-4 h-4 text-primary" />
          La app sigue renderizando estados vacios y formularios aunque la base todavia no este conectada.
        </div>

        <div className="mt-6">
          <Link href="/login" className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium btn-premium">
            Ir al login
          </Link>
        </div>
      </div>
    </div>
  )
}
