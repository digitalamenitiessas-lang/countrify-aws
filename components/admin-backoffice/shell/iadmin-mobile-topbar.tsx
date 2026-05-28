'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { IAdminSidebar } from './iadmin-sidebar'
import type { IAdminCapability } from '@/lib/types'
import type { SwitcherProperty } from './consorcio-switcher'

interface Props {
  administrationName: string
  operationalRole: string | null
  allowedCapabilities: IAdminCapability[]
  properties: SwitcherProperty[]
  cookiePropertyId: string | null
}

export function IAdminMobileTopBar({
  administrationName,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  operationalRole: _operationalRole,
  allowedCapabilities,
  properties,
  cookiePropertyId,
}: Props) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Cerrar al cambiar de ruta.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Esc + lock body scroll.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  return (
    <>
      <div className="lg:hidden sticky top-16 z-30 -mx-4 mb-4 border-b border-border/40 bg-background/95 backdrop-blur px-4 py-2 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center justify-center rounded-md p-1.5 text-foreground hover:bg-muted/60"
          aria-label="Abrir menú backoffice"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 text-right">
          <div className="text-[10px] uppercase tracking-wider text-primary font-medium">
            Backoffice
          </div>
          <div className="text-sm font-semibold text-foreground truncate">
            {administrationName}
          </div>
        </div>
      </div>

      {open ? (
        <div
          className="lg:hidden fixed inset-0 z-50 flex"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="absolute inset-0 bg-black/40" aria-hidden />
          <div
            className="relative z-10 w-80 max-w-[90vw] bg-background shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-end px-4 py-3 border-b border-border/40">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted/60"
                aria-label="Cerrar menú"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3">
              <IAdminSidebar
                administrationName={administrationName}
                allowedCapabilities={allowedCapabilities}
                properties={properties}
                cookiePropertyId={cookiePropertyId}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
