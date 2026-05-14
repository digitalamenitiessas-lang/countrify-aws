import { notFound } from 'next/navigation'
import { Building2, CalendarClock, CheckCircle2, Mail, Phone, Wallet } from 'lucide-react'
import { getPublicLiquidationByToken } from '@/lib/iadmin/public-liquidation'
import type { Metadata } from 'next'

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export const metadata: Metadata = {
  title: 'Tu liquidacion de expensas',
  robots: { index: false, follow: false },
}

export default async function VecinoLiquidacionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const view = await getPublicLiquidationByToken(token)
  if (!view) notFound()

  const monthLabel = MONTH_NAMES[view.periodMonth - 1] ?? ''
  const isPaid = view.balanceRemaining < 0.01 && view.subtotal > 0

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <header className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wider text-slate-500">Liquidación de expensas</div>
              <div className="font-serif text-xl font-bold text-slate-900 truncate">{view.propertyName}</div>
              <div className="text-xs text-slate-500 truncate">{view.propertyAddress}</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Período</div>
              <div className="text-slate-900 font-medium">{monthLabel} {view.periodYear}</div>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Unidad</div>
              <div className="text-slate-900 font-medium">
                {view.unitCode}
                {view.holderName ? <span className="text-slate-500"> · {view.holderName}</span> : null}
              </div>
            </div>
          </div>
        </header>

        {/* Monto destacado */}
        <section
          className={`rounded-2xl p-6 text-center border shadow-sm ${
            isPaid
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-gradient-to-br from-primary/10 to-primary/5 border-primary/30'
          }`}
        >
          {isPaid ? (
            <>
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
              <div className="text-sm text-emerald-900 font-medium">Mes al día</div>
              <div className="text-xs text-emerald-800 mt-1">
                Total del período: {formatARS(view.subtotal)} · Cobrado: {formatARS(view.collectedAmount)}
              </div>
            </>
          ) : (
            <>
              <div className="text-xs uppercase tracking-wider text-slate-600 font-medium">A pagar</div>
              <div className="font-serif text-4xl font-bold text-slate-900 tabular-nums mt-1">
                {formatARS(view.balanceRemaining)}
              </div>
              {view.collectedAmount > 0 ? (
                <div className="text-xs text-slate-600 mt-2">
                  Total liquidado: {formatARS(view.subtotal)} · Ya cobrado: {formatARS(view.collectedAmount)}
                </div>
              ) : null}
            </>
          )}
        </section>

        {/* Vencimientos */}
        {!isPaid && view.dueDates.length > 0 ? (
          <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <header className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-slate-500" />
              <div className="text-xs uppercase tracking-wider text-slate-500 font-medium">Vencimientos</div>
            </header>
            <ul className="divide-y divide-slate-100">
              {view.dueDates.map((due) => (
                <li key={due.label} className="px-4 py-3 flex items-center justify-between text-sm">
                  <div>
                    <div className="text-slate-900 font-medium">{due.label}</div>
                    <div className="text-xs text-slate-500">
                      {due.date}
                      {due.surchargePct > 0 ? ` · +${due.surchargePct}% recargo` : ''}
                    </div>
                  </div>
                  <div className="font-serif text-lg font-bold text-slate-900 tabular-nums">
                    {formatARS(due.amount)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Composición */}
        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <header className="px-4 py-3 border-b border-slate-200">
            <div className="text-xs uppercase tracking-wider text-slate-500 font-medium">¿Qué incluye?</div>
          </header>
          <dl className="divide-y divide-slate-100 text-sm">
            <DL label="Expensas ordinarias" value={formatARS(view.ordinaryAmount)} />
            {view.extraordinaryAmount > 0 ? (
              <DL label="Expensas extraordinarias" value={formatARS(view.extraordinaryAmount)} />
            ) : null}
            {view.previousBalance > 0 ? (
              <DL label="Saldo anterior" value={formatARS(view.previousBalance)} tone="warning" />
            ) : null}
            <DL label="Total del período" value={formatARS(view.subtotal)} emphasize />
          </dl>
        </section>

        {/* Recibos pagados */}
        {view.recentPayments.length > 0 ? (
          <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <header className="px-4 py-3 border-b border-slate-200">
              <div className="text-xs uppercase tracking-wider text-slate-500 font-medium">Pagos registrados</div>
            </header>
            <ul className="divide-y divide-slate-100">
              {view.recentPayments.map((p, idx) => (
                <li key={idx} className="px-4 py-2.5 flex items-center justify-between text-sm">
                  <div>
                    <div className="text-slate-900">
                      {p.receiptNumber ? `Recibo ${p.receiptNumber}` : 'Pago'}
                      {p.method ? <span className="text-slate-500 text-xs"> · {p.method}</span> : null}
                    </div>
                    <div className="text-xs text-slate-500">{p.paidAt}</div>
                  </div>
                  <div className="font-medium text-emerald-700 tabular-nums">{formatARS(p.amount)}</div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Datos bancarios */}
        {view.legalInfo.bank?.cbu || view.legalInfo.bank?.alias ? (
          <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <header className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-slate-500" />
              <div className="text-xs uppercase tracking-wider text-slate-500 font-medium">Datos para transferir</div>
            </header>
            <dl className="divide-y divide-slate-100 text-sm">
              {view.legalInfo.bank?.name ? <DL label="Banco" value={view.legalInfo.bank.name} /> : null}
              {view.legalInfo.bank?.account ? <DL label="Nº de cuenta" value={view.legalInfo.bank.account} mono /> : null}
              {view.legalInfo.bank?.cbu ? <DL label="CBU" value={view.legalInfo.bank.cbu} mono /> : null}
              {view.legalInfo.bank?.alias ? <DL label="Alias" value={view.legalInfo.bank.alias} mono /> : null}
            </dl>
          </section>
        ) : null}

        {view.legalInfo.collectionSchedule || view.legalInfo.accountantName ? (
          <section className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 text-sm space-y-2">
            {view.legalInfo.collectionSchedule ? (
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-1">
                  Cobranza presencial
                </div>
                <p className="text-slate-900 whitespace-pre-line">{view.legalInfo.collectionSchedule}</p>
              </div>
            ) : null}
            {view.legalInfo.accountantName ? (
              <div className="pt-2 border-t border-slate-100 space-y-0.5">
                <div className="text-xs text-slate-500">Consultas:</div>
                <div className="text-slate-900 font-medium">{view.legalInfo.accountantName}</div>
                {view.legalInfo.accountantPhone ? (
                  <div className="text-xs text-slate-600 flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {view.legalInfo.accountantPhone}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        <footer className="text-center text-[11px] text-slate-400 pt-2 pb-6">
          Generado por Countrify IAdmin
          {view.expiresAt ? ` · Válido hasta ${view.expiresAt.slice(0, 10)}` : ''}
        </footer>
      </div>
    </div>
  )
}

function DL({
  label,
  value,
  emphasize,
  tone,
  mono,
}: {
  label: string
  value: string
  emphasize?: boolean
  tone?: 'warning'
  mono?: boolean
}) {
  return (
    <div className="px-4 py-2.5 flex items-center justify-between gap-3">
      <dt className="text-slate-500 text-xs">{label}</dt>
      <dd
        className={`${emphasize ? 'font-serif text-lg font-bold text-slate-900' : 'text-sm text-slate-900'} tabular-nums ${tone === 'warning' ? 'text-amber-700' : ''} ${mono ? 'font-mono text-xs' : ''}`}
      >
        {value}
      </dd>
    </div>
  )
}
