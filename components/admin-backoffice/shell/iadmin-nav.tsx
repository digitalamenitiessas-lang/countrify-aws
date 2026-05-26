'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Banknote, Bell, BellRing, Building2, Megaphone, Receipt, ScrollText, Wallet } from 'lucide-react'
import type { IAdminCapability } from '@/lib/types'

const NAV_ITEMS: ReadonlyArray<{
  href: string
  label: string
  icon: typeof Building2
  need: IAdminCapability
  matchPrefix?: string
  acceptsPropertyScope?: boolean
}> = [
  { href: '/iadmin/cartera', label: 'Cartera', icon: Building2, need: 'portfolio.view', matchPrefix: '/iadmin/cartera' },
  { href: '/iadmin/gastos', label: 'Gastos', icon: Receipt, need: 'expenses.view', matchPrefix: '/iadmin/gastos' },
  { href: '/iadmin/liquidaciones', label: 'Liquidaciones', icon: ScrollText, need: 'liquidations.view', matchPrefix: '/iadmin/liquidaciones' },
  { href: '/iadmin/cobranzas', label: 'Cobranzas', icon: Wallet, need: 'collections.view', matchPrefix: '/iadmin/cobranzas', acceptsPropertyScope: true },
  { href: '/iadmin/recordatorios', label: 'Recordatorios', icon: BellRing, need: 'reminders.generate', matchPrefix: '/iadmin/recordatorios', acceptsPropertyScope: true },
  { href: '/iadmin/comunicaciones', label: 'Comunicados', icon: Megaphone, need: 'communications.send', matchPrefix: '/iadmin/comunicaciones' },
]

const CONSORCIO_PATH_RE = /^\/iadmin\/consorcios\/([0-9a-f-]{36})(?:\/|$)/i

function currentPropertyScope(pathname: string, search: URLSearchParams): string | null {
  const fromQuery = search.get('propertyId')
  if (fromQuery) return fromQuery
  const fromPath = pathname.match(CONSORCIO_PATH_RE)
  return fromPath?.[1] ?? null
}

export function IAdminNav({ allowedCapabilities }: { allowedCapabilities: IAdminCapability[] }) {
  const pathname = usePathname() ?? ''
  const searchParams = useSearchParams()
  const allowed = new Set(allowedCapabilities)
  const propertyId = currentPropertyScope(pathname, searchParams ?? new URLSearchParams())

  return (
    <nav className="flex flex-col gap-1 p-3">
      {NAV_ITEMS.filter((item) => allowed.has(item.need)).map((item) => {
        const isActive = item.matchPrefix ? pathname.startsWith(item.matchPrefix) : pathname === item.href
        const Icon = item.icon
        const href = item.acceptsPropertyScope && propertyId
          ? `${item.href}?propertyId=${propertyId}`
          : item.href
        return (
          <Link
            key={item.href}
            href={href}
            className={[
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
              isActive
                ? 'bg-primary/10 text-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            ].join(' ')}
          >
            <Icon className="w-4 h-4" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

export function IAdminNotificationsBadge() {
  return (
    <button
      type="button"
      className="relative rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label="Notificaciones"
    >
      <Bell className="w-4 h-4" />
    </button>
  )
}

export function IAdminBalanceHint() {
  return (
    <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
      <Banknote className="w-3.5 h-3.5" />
      Cierre del periodo en curso
    </div>
  )
}
