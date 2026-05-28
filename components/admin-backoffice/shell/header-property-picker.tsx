'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Building2, Check, ChevronDown, Globe, Search } from 'lucide-react'
import type { SwitcherProperty } from './consorcio-switcher'

type Props = {
  properties: SwitcherProperty[]
  cookiePropertyId: string | null
}

const COOKIE_NAME = 'currentPropertyId'

function setCookie(value: string) {
  if (typeof document === 'undefined') return
  const maxAge = 60 * 60 * 24 * 90
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`
}

export function HeaderPropertyPicker({ properties, cookiePropertyId }: Props) {
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  // 0 propiedades → no mostramos nada. 1 propiedad → solo el chip estático.
  if (properties.length === 0) return null

  // Active: URL > cookie > "all" implícito.
  const urlMatch = pathname.match(/^\/iadmin\/consorcios\/([^/]+)/)
  const urlPropertyId = urlMatch ? urlMatch[1] : null
  const activeFromUrl = urlPropertyId
    ? properties.find((p) => p.id === urlPropertyId)
    : null
  const isAllCookie = cookiePropertyId === 'all'
  const activeFromCookie =
    !isAllCookie && cookiePropertyId
      ? properties.find((p) => p.id === cookiePropertyId)
      : null
  const active = activeFromUrl ?? activeFromCookie ?? null

  // Si solo hay un consorcio y nada activo, no hace falta dropdown.
  const interactive = properties.length > 1

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

  function pickAll() {
    setCookie('all')
    setOpen(false)
    setQuery('')
    // Si estamos dentro de un consorcio, salir al home global.
    if (urlMatch) {
      router.push('/iadmin')
    } else {
      router.refresh()
    }
  }

  function pickProperty(propertyId: string) {
    setCookie(propertyId)
    setOpen(false)
    setQuery('')
    if (urlMatch) {
      const suffix = pathname.replace(/^\/iadmin\/consorcios\/[^/]+/, '') || ''
      router.push(`/iadmin/consorcios/${propertyId}${suffix}`)
    } else {
      router.refresh()
    }
  }

  const normalizedQuery = query.trim().toLowerCase()
  const filtered = normalizedQuery
    ? properties.filter((p) => {
        const name = (p.displayName ?? p.buildingName ?? '').toLowerCase()
        const addr = (p.buildingAddress ?? '').toLowerCase()
        return name.includes(normalizedQuery) || addr.includes(normalizedQuery)
      })
    : properties

  const label = active ? active.displayName ?? active.buildingName : 'Todos los countries'
  const Icon = active ? Building2 : Globe

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => interactive && setOpen((v) => !v)}
        className={[
          'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors max-w-[260px]',
          active
            ? 'border-primary/30 bg-primary/5 hover:border-primary/50'
            : 'border-border/60 bg-background hover:border-primary/40 hover:bg-muted/40',
          interactive ? 'cursor-pointer' : 'cursor-default',
        ].join(' ')}
        aria-haspopup={interactive ? 'listbox' : undefined}
        aria-expanded={open}
      >
        <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
        <div className="min-w-0 flex-1 text-left">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none">
            {active ? 'Country' : 'Vista'}
          </div>
          <div className="text-sm font-medium text-foreground truncate leading-tight mt-0.5">
            {label}
          </div>
        </div>
        {interactive ? (
          <ChevronDown
            className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        ) : null}
      </button>

      {open && interactive ? (
        <div className="absolute right-0 z-40 mt-1 w-80 max-w-[90vw] rounded-xl border border-border/60 bg-background shadow-xl overflow-hidden">
          <div className="border-b border-border/40 p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar country…"
                className="w-full rounded-md border border-border/50 bg-background pl-8 pr-2 py-1.5 text-sm focus:outline-none focus:border-primary/50"
                autoFocus
              />
            </div>
          </div>
          <ul className="max-h-72 overflow-y-auto p-1">
            <li>
              <button
                type="button"
                onClick={pickAll}
                className={`w-full text-left flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors ${
                  !active ? 'bg-primary/10' : 'hover:bg-muted/60'
                }`}
              >
                <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">Todos los countries</div>
                  <div className="text-xs text-muted-foreground">Vista consolidada</div>
                </div>
                {!active ? <Check className="w-3.5 h-3.5 text-primary shrink-0" /> : null}
              </button>
            </li>
            <li className="px-2 py-1 mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
              Countries
            </li>
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-muted-foreground">Sin resultados</li>
            ) : (
              filtered.map((p) => {
                const isActive = active?.id === p.id
                const name = p.displayName ?? p.buildingName
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => pickProperty(p.id)}
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
        </div>
      ) : null}
    </div>
  )
}
