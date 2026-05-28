import { MapPin } from 'lucide-react'
import type { IAdminCapability } from '@/lib/types'

/**
 * Banner del consorcio (sin tabs).
 * Las tabs migraron al sidebar (sección "Edificio activo"). Acá solo mostramos
 * el nombre y la dirección como contexto visual de la pantalla actual.
 */
export function ConsorcioSubNav({
  propertyName,
  propertyAddress,
}: {
  propertyId: string
  propertyName: string
  propertyAddress: string
  allowedCapabilities: IAdminCapability[]
}) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <p className="text-xs uppercase tracking-wider text-primary font-medium">Consorcio</p>
      <h1 className="font-serif text-xl font-bold text-foreground mt-0.5 truncate">
        {propertyName}
      </h1>
      {propertyAddress ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
          <MapPin className="w-3 h-3" />
          <span className="truncate">{propertyAddress}</span>
        </div>
      ) : null}
    </div>
  )
}
