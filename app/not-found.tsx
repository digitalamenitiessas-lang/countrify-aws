import Link from 'next/link'
import { Home } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background pt-20 pb-16 flex items-center justify-center px-6">
      <div className="glass-card rounded-2xl p-8 w-full max-w-md text-center">
        <div className="text-7xl font-serif font-bold text-primary mb-2">404</div>
        <h1 className="font-serif text-xl font-bold text-foreground">Página no encontrada</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          El link que seguiste no existe o ya no está disponible. Puede haberse movido o expirado.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg btn-premium px-4 py-2 text-sm font-medium text-white"
        >
          <Home className="h-4 w-4" />
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
