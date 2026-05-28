'use client'

import { useRouter } from 'next/navigation'
import { Building2, X } from 'lucide-react'

type Props = {
  propertyName: string
  /** Total de registros mostrados en el listado tras el filtro. Opcional. */
  count?: number
  itemLabel?: string
}

/** Banner visible en páginas cross-cartera cuando hay un edificio activo. */
export function PropertyFilterBanner({ propertyName, count, itemLabel = 'registros' }: Props) {
  const router = useRouter()

  function clearFilter() {
    // Marcamos "all" para que el switcher y los reads server-side lo interpreten como sin filtro.
    document.cookie = `currentPropertyId=all; path=/; max-age=${60 * 60 * 24 * 90}; SameSite=Lax`
    router.refresh()
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-muted-foreground">Filtrando por</span>
        <span className="font-medium text-foreground truncate">{propertyName}</span>
        {typeof count === 'number' ? (
          <span className="text-xs text-muted-foreground hidden sm:inline">
            · {count} {itemLabel}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={clearFilter}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-background hover:text-foreground transition-colors shrink-0"
      >
        <X className="w-3 h-3" />
        Ver todos
      </button>
    </div>
  )
}
