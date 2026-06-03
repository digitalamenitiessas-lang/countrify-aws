'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, Home, ListChecks, Plus, Shield, Tag, Users } from 'lucide-react'

type NavItem = {
  href: string
  label: string
  icon: typeof Building2
  match: (pathname: string) => boolean
}

const ITEMS: ReadonlyArray<NavItem> = [
  { href: '/superadmin', label: 'Inicio', icon: Home, match: (p) => p === '/superadmin' },
  { href: '/superadmin/usuarios', label: 'Usuarios', icon: Users, match: (p) => p.startsWith('/superadmin/usuarios') },
  { href: '/superadmin/negocios', label: 'Negocios', icon: Building2, match: (p) => p.startsWith('/superadmin/negocios') },
  { href: '/superadmin/promociones', label: 'Promociones', icon: Tag, match: (p) => p.startsWith('/superadmin/promociones') },
]

const CONSORCIO_ITEMS: ReadonlyArray<NavItem> = [
  {
    href: '/superadmin/consorcios',
    label: 'Todos',
    icon: ListChecks,
    match: (p) => p.startsWith('/superadmin/consorcios') && p !== '/superadmin/consorcios/nuevo',
  },
  {
    href: '/superadmin/consorcios/nuevo',
    label: 'Crear',
    icon: Plus,
    match: (p) => p === '/superadmin/consorcios/nuevo',
  },
]

function navClass(active: boolean, indented = false) {
  return [
    'flex items-center gap-2.5 rounded-md py-1.5 text-[13px] transition-colors',
    indented ? 'pl-6 pr-3 text-[12.5px]' : 'px-3',
    active
      ? 'bg-primary/10 text-foreground font-medium'
      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
  ].join(' ')
}

export function SuperAdminSidebar() {
  const pathname = usePathname() ?? ''

  return (
    <div className="flex flex-col gap-1">
      <div className="px-3 pb-3 mb-1">
        <div className="flex items-center gap-2">
          <div
            className="sa-icon-disc w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #112250, #0a1838)' }}
          >
            <Shield className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-primary/80 font-semibold">Super administrador</div>
            <div className="text-sm font-semibold text-foreground truncate leading-tight">Countrify</div>
          </div>
        </div>
      </div>

      <nav className="flex flex-col gap-px">
        {ITEMS.slice(0, 1).map((item) => {
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href} className={navClass(item.match(pathname))}>
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Consorcios: Todos + Crear */}
      <div className="mt-4 px-3 flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold">Consorcios</div>
      </div>
      <nav className="flex flex-col gap-px mt-0.5">
        {CONSORCIO_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href} className={navClass(item.match(pathname), true)}>
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <nav className="flex flex-col gap-px mt-4">
        {ITEMS.slice(1).map((item) => {
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href} className={navClass(item.match(pathname))}>
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

const MOBILE_ITEMS: ReadonlyArray<NavItem> = [
  ITEMS[0],
  CONSORCIO_ITEMS[0],
  CONSORCIO_ITEMS[1],
  ITEMS[1],
  ITEMS[2],
  ITEMS[3],
]

export function SuperAdminMobileNav() {
  const pathname = usePathname() ?? ''
  return (
    <div className="lg:hidden -mx-4 mb-4 overflow-x-auto border-b border-border/40 px-4">
      <nav className="flex w-max gap-1 pb-2">
        {MOBILE_ITEMS.map((item) => {
          const Icon = item.icon
          const active = item.match(pathname)
          const label = item === CONSORCIO_ITEMS[0] ? 'Consorcios' : item === CONSORCIO_ITEMS[1] ? 'Crear' : item.label
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] transition-colors',
                active ? 'bg-primary/10 text-foreground font-medium' : 'text-muted-foreground hover:bg-muted/60',
              ].join(' ')}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
