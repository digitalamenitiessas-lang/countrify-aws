'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  FileSpreadsheet,
  Megaphone,
  MessageSquareText,
  Plus,
  Receipt,
  Wallet,
  X,
  Zap,
} from 'lucide-react'
import type { IAdminCapability } from '@/lib/types'

type Action = {
  label: string
  hint: string
  href: string
  icon: typeof Plus
  need: IAdminCapability
  tone: string
}

const ACTIONS: ReadonlyArray<Action> = [
  {
    label: 'Cargar gasto',
    hint: 'Factura nueva de proveedor',
    href: '/iadmin/gastos',
    icon: Receipt,
    need: 'expenses.create',
    tone: 'bg-amber-100 text-amber-700',
  },
  {
    label: 'Registrar cobro',
    hint: 'Pago recibido de un vecino',
    href: '/iadmin/cobranzas',
    icon: Wallet,
    need: 'collections.register',
    tone: 'bg-emerald-100 text-emerald-700',
  },
  {
    label: 'Enviar comunicado',
    hint: 'Aviso a todo el edificio',
    href: '/iadmin/comunicaciones',
    icon: Megaphone,
    need: 'communications.send',
    tone: 'bg-purple-100 text-purple-700',
  },
  {
    label: 'Ver reclamos',
    hint: 'Pendientes de los vecinos',
    href: '/iadmin/expedientes',
    icon: MessageSquareText,
    need: 'consorcio.view',
    tone: 'bg-rose-100 text-rose-700',
  },
]

type Props = {
  allowedCapabilities: IAdminCapability[]
}

export function QuickActionsFab({ allowedCapabilities }: Props) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname() ?? ''
  const allowed = new Set(allowedCapabilities)
  const visible = ACTIONS.filter((a) => allowed.has(a.need))

  // Si estamos dentro de un consorcio, agregamos atajo a "Importar Excel"
  // del edificio actual (extrae el id de la URL).
  const consorcioMatch = pathname.match(/^\/iadmin\/consorcios\/([^/]+)/)
  const importHref = consorcioMatch ? `/iadmin/consorcios/${consorcioMatch[1]}/importar` : null
  const showImport = importHref && allowed.has('units.manage')

  // Esc cierra el modal.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  if (visible.length === 0 && !showImport) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-30 inline-flex items-center gap-2 rounded-full bg-orange-500 px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-orange-600 transition-all hover:scale-105 active:scale-95"
        aria-label="Abrir acciones rápidas"
      >
        <Zap className="w-4 h-4" />
        <span className="hidden sm:inline">Acciones rápidas</span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="glass-card w-full max-w-md rounded-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-orange-600 font-medium">
                  <Zap className="w-3 h-3" />
                  Acciones rápidas
                </div>
                <h2 className="font-serif text-lg font-bold text-foreground mt-0.5">
                  ¿Qué querés hacer?
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted/60"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ul className="space-y-1.5">
              {visible.map((action) => {
                const Icon = action.icon
                return (
                  <li key={action.href}>
                    <Link
                      href={action.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-muted/40 transition-colors group"
                    >
                      <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${action.tone}`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                          {action.label}
                        </div>
                        <div className="text-xs text-muted-foreground">{action.hint}</div>
                      </div>
                    </Link>
                  </li>
                )
              })}
              {showImport && importHref ? (
                <li>
                  <Link
                    href={importHref}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-muted/40 transition-colors group"
                  >
                    <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-indigo-100 text-indigo-700">
                      <FileSpreadsheet className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                        Importar desde Excel
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Carga masiva de unidades y titulares
                      </div>
                    </div>
                  </Link>
                </li>
              ) : null}
            </ul>

            <p className="mt-4 text-[11px] text-muted-foreground italic text-center">
              Tip: también podés usar el sidebar para navegar.
            </p>
          </div>
        </div>
      ) : null}
    </>
  )
}
