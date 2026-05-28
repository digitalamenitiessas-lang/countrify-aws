'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Building2, Check, ChevronDown, Search } from 'lucide-react'

export type SwitcherProperty = {
  id: string
  displayName: string | null
  buildingName: string
  buildingAddress: string | null
  totalUnits?: number | null
}

type Props = {
  properties: SwitcherProperty[]
  /** Valor inicial leído de la cookie en el server. Si la URL contiene un consorcio, ese pisa este. */
  cookiePropertyId: string | null
}

const COOKIE_NAME = 'currentPropertyId'
const COOKIE_MAX_AGE_DAYS = 90

function setCurrentPropertyCookie(propertyId: string) {
  if (typeof document === 'undefined') return
  const maxAge = 60 * 60 * 24 * COOKIE_MAX_AGE_DAYS
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(propertyId)}; path=/; max-age=${maxAge}; SameSite=Lax`
}

export function ConsorcioSwitcher({ properties, cookiePropertyId }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const containerRef = useRef<HTMLDivElement>(null)

  // Si solo hay un consorcio (o ninguno), no mostramos el selector.
  if (properties.length <= 1) return null

  // Prioridad: URL (si estamos dentro de un consorcio) > cookie > primer disponible.
  const urlMatch = pathname.match(/^\/iadmin\/consorcios\/([^/]+)/)
  const urlPropertyId = urlMatch ? urlMatch[1] : null
  const activeFromUrl = urlPropertyId
    ? properties.find((p) => p.id === urlPropertyId)
    : null
  const activeFromCookie = cookiePropertyId
    ? properties.find((p) => p.id === cookiePropertyId)
    : null
  const active = activeFromUrl ?? activeFromCookie ?? properties[0]

  // Cerrar al click fuera o Esc.
  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKey)
    }
  }, [open])

  // Filtro local por nombre/dirección.
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = normalizedQuery
    ? properties.filter((p) => {
        const name = (p.displayName ?? p.buildingName ?? '').toLowerCase()
        const addr = (p.buildingAddress ?? '').toLowerCase()
        return name.includes(normalizedQuery) || addr.includes(normalizedQuery)
      })
    : properties

  function handleSelect(propertyId: string) {
    setCurrentPropertyCookie(propertyId)
    setOpen(false)
    setQuery('')

    // Si estamos dentro de un consorcio específico, navegamos al mismo path del nuevo consorcio.
    const consorcioPathMatch = pathname.match(/^\/iadmin\/consorcios\/[^/]+(\/.*)?$/)
    if (consorcioPathMatch) {
      const suffix = consorcioPathMatch[1] ?? ''
      router.push(`/iadmin/consorcios/${propertyId}${suffix}`)
    } else {
      // Si estamos en una página cross-cartera, refrescamos para que pueda re-filtrar si aplica.
      router.refresh()
    }
  }

  const activeLabel = active.displayName ?? active.buildingName

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm hover:border-primary/40 hover:bg-muted/40 transition-colors max-w-[220px]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="truncate font-medium text-foreground">{activeLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div
          className="absolute right-0 z-40 mt-2 w-80 max-w-[90vw] rounded-xl border border-border/60 bg-background shadow-xl overflow-hidden"
          role="listbox"
        >
          <div className="border-b border-border/40 p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar consorcio…"
                className="w-full rounded-md border border-border/50 bg-background pl-8 pr-2 py-1.5 text-sm focus:outline-none focus:border-primary/50"
                autoFocus
              />
            </div>
          </div>
          <ul className="max-h-72 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                Sin resultados
              </li>
            ) : (
              filtered.map((p) => {
                const isActive = p.id === active.id
                const name = p.displayName ?? p.buildingName
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(p.id)}
                      className={`w-full text-left flex items-start gap-2 rounded-md px-2.5 py-2 text-sm transition-colors ${
                        isActive ? 'bg-primary/10' : 'hover:bg-muted/60'
                      }`}
                    >
                      <Building2 className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-foreground truncate">{name}</div>
                        {p.buildingAddress ? (
                          <div className="text-xs text-muted-foreground truncate">{p.buildingAddress}</div>
                        ) : null}
                      </div>
                      {isActive ? <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-1" /> : null}
                    </button>
                  </li>
                )
              })
            )}
          </ul>
          <div className="border-t border-border/40 p-1.5">
            <Link
              href="/iadmin/cartera"
              onClick={() => setOpen(false)}
              className="block rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              Ver cartera completa →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
