import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowRight,
  Banknote,
  Building2,
  FileSpreadsheet,
  Scale,
  ScrollText,
  Truck,
} from 'lucide-react'
import { requireIAdmin } from '@/lib/auth'
import { getIAdminConsorcioDetail } from '@/lib/data'

type ConfigCard = {
  key: string
  title: string
  description: string
  href: (id: string) => string
  icon: typeof Building2
}

const CARDS: ConfigCard[] = [
  {
    key: 'gestion',
    title: 'Datos del consorcio',
    description: 'Nombre, CUIT, fee, tipo. Unidades y titulares. Período contable.',
    href: (id) => `/iadmin/consorcios/${id}/gestion`,
    icon: Building2,
  },
  {
    key: 'proveedores',
    title: 'Proveedores',
    description: 'Catálogo de proveedores recurrentes. Datos de contacto.',
    href: () => '/iadmin/proveedores',
    icon: Truck,
  },
  {
    key: 'cuentas',
    title: 'Cuentas bancarias',
    description: 'Cuenta operativa, fondo de reserva, CBU/alias para cobrar.',
    href: (id) => `/iadmin/consorcios/${id}/cuentas`,
    icon: Banknote,
  },
  {
    key: 'conciliacion',
    title: 'Conciliación bancaria',
    description: 'Subir extracto y matchear pagos con residentes y proveedores.',
    href: (id) => `/iadmin/consorcios/${id}/conciliacion`,
    icon: Scale,
  },
  {
    key: 'importar',
    title: 'Importar unidades desde Excel',
    description: 'Carga masiva de unidades y titulares desde tu planilla actual.',
    href: (id) => `/iadmin/consorcios/${id}/importar`,
    icon: FileSpreadsheet,
  },
  {
    key: 'dashboard',
    title: 'Reportes del consorcio',
    description: 'KPIs agregados, saldos, cobranzas, deudas, proyección IA.',
    href: (id) => `/iadmin/consorcios/${id}/dashboard`,
    icon: ScrollText,
  },
]

export default async function ConfiguracionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireIAdmin({ capability: 'consorcio.view' })
  const detail = await getIAdminConsorcioDetail(id)
  if (!detail) notFound()

  return (
    <div className="space-y-6">
      <header className="glass-card rounded-2xl p-6">
        <p className="text-xs uppercase tracking-wider text-primary font-medium">Configuración</p>
        <h1 className="font-serif text-2xl font-bold text-foreground mt-1">Herramientas del consorcio</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Todo lo que no es carga mensual de gastos. Configurá una vez y casi nunca volvés acá.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {CARDS.map((card) => {
          const Icon = card.icon
          return (
            <Link
              key={card.key}
              href={card.href(id)}
              className="glass-card rounded-2xl p-5 hover:border-primary/40 hover:bg-muted/30 transition-colors group"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-foreground group-hover:text-primary">{card.title}</h3>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
                </div>
              </div>
            </Link>
          )
        })}
      </section>

      <div className="text-[11px] text-muted-foreground text-center italic">
        Para gestionar datos legales de toda la administración, teléfonos, seguros compartidos, etc.,
        usá las herramientas globales desde el sidebar.
      </div>
    </div>
  )
}
