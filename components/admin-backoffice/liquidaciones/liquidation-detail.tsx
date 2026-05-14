'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { Building2, Calendar, CalendarClock, CheckCircle2, FileText, Info, Printer, ReceiptText, Scale } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { IAdminCapability, IAdminLiquidationItem, IAdminLiquidationRunDetail, IAdminLiquidationStatus } from '@/lib/types'
import { Money } from '@/components/admin-backoffice/shared/money'
import { LiquidationStatusActions } from '@/components/admin-backoffice/liquidaciones/liquidation-status-actions'
import { QuickPayButton } from '@/components/admin-backoffice/cobranzas/quick-pay-button'
import { RegisterCollectionForm } from '@/components/admin-backoffice/cobranzas/register-collection-form'
import { ShareLinkButton } from '@/components/admin-backoffice/cobranzas/share-link-button'
import { VoidPaymentButton } from '@/components/admin-backoffice/cobranzas/void-payment-button'

const STATUS_LABELS: Record<IAdminLiquidationStatus, string> = {
  draft: 'Borrador',
  calculated: 'Calculada',
  issued: 'Emitida',
  closed: 'Cerrada',
}

const STATUS_TONE: Record<IAdminLiquidationStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  calculated: 'bg-amber-100 text-amber-800',
  issued: 'bg-sky-100 text-sky-800',
  closed: 'bg-emerald-100 text-emerald-800',
}

const MONTH_NAMES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
]

type Props = {
  run: IAdminLiquidationRunDetail
  userCapabilities: IAdminCapability[]
}

export function LiquidationDetail({ run, userCapabilities }: Props) {
  const monthLabel = MONTH_NAMES[run.periodMonth - 1] ?? ''
  const hasCoverageIssue = Math.abs(run.coverageDelta) > 0.02
  const legal = { ...run.administrationLegalInfo, ...run.propertyLegalInfo }
  const caps = new Set(userCapabilities)
  const canCollect = caps.has('collections.register') && run.status !== 'draft'
  const canVoid = caps.has('collections.void')
  const canShare = caps.has('liquidations.share') && run.status !== 'draft'
  const [collectingItem, setCollectingItem] = useState<IAdminLiquidationItem | null>(null)
  const defaultCashAccount = run.cashAccounts.find((a) => a.isActive) ?? null
  const periodLabel = `${String(run.periodMonth).padStart(2, '0')}/${run.periodYear}`

  return (
    <div className="space-y-6">
      {/* ----- Header tipo boleta ----- */}
      <section className="glass-card rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-primary font-medium">Liquidacion de expensas</p>
            <h1 className="font-serif text-2xl font-bold text-foreground mt-1">
              <Link href={`/iadmin/consorcios/${run.managedPropertyId}`} className="hover:text-primary">
                {run.managedPropertyName}
              </Link>
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">{run.managedPropertyAddress}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Periodo <span className="font-medium text-foreground">{monthLabel} {run.periodYear}</span>
              {' · '}Generada: {run.generatedAt.slice(0, 16).replace('T', ' ')}
              {run.generatedByName ? ` · por ${run.generatedByName}` : ''}
              {run.issuedAt ? ` · Emitida: ${run.issuedAt.slice(0, 16).replace('T', ' ')}${run.issuedByName ? ` por ${run.issuedByName}` : ''}` : ''}
              {run.closedAt ? ` · Cerrada: ${run.closedAt.slice(0, 16).replace('T', ' ')}${run.closedByName ? ` por ${run.closedByName}` : ''}` : ''}
            </p>
          </div>
          <span className={`shrink-0 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[run.status]}`}>
            {STATUS_LABELS[run.status]}
          </span>
        </div>

        {/* Vencimientos destacados */}
        {run.dueDates.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {run.dueDates.map((due) => (
              <div
                key={due.label}
                className="rounded-xl border border-border/60 bg-muted/40 px-4 py-2.5 flex items-center gap-3"
              >
                <CalendarClock className="w-4 h-4 text-primary shrink-0" />
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {due.label}
                    {due.surchargePct > 0 ? ` · +${due.surchargePct}%` : ''}
                  </div>
                  <div className="text-sm font-medium text-foreground tabular-nums">{due.date}</div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {/* ----- Totales ----- */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Ordinarias" value={<Money amount={run.ordinaryTotal} />} icon={FileText} />
        <Stat label="Extraordinarias" value={<Money amount={run.extraordinaryTotal} />} icon={ReceiptText} />
        <Stat label="Cobrado" value={<Money amount={run.collectedTotal} />} icon={CheckCircle2} tone="ok" />
        <Stat
          label="Saldo pendiente"
          value={<Money amount={run.balanceTotal} />}
          icon={Scale}
          tone={run.balanceTotal > 0.02 ? 'warning' : 'ok'}
        />
        <Stat label="Unidades" value={run.totalUnits.toString()} icon={Building2} />
      </section>

      {hasCoverageIssue ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ⚠ Diferencia de <Money amount={run.coverageDelta} /> entre gastos imputados y total asignado.
          Suele deberse a alicuotas que no suman 100%. Ajustalas y recalcula.
        </div>
      ) : null}

      {/* ----- Acciones ----- */}
      <section className="glass-card rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-serif text-lg font-semibold text-foreground">Acciones</h2>
          <Link
            href={`/print/liquidaciones/${run.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <Printer className="w-3.5 h-3.5" />
            Vista imprimible / PDF
          </Link>
        </div>
        <LiquidationStatusActions
          runId={run.id}
          propertyId={run.managedPropertyId}
          periodId={run.accountingPeriodId}
          currentStatus={run.status}
          userCapabilities={userCapabilities}
        />
      </section>

      {/* ----- Estado de cuenta del consorcio (balance de caja) ----- */}
      <section className="glass-card rounded-2xl overflow-hidden">
        <header className="px-5 py-4 border-b border-border/40">
          <h2 className="font-serif text-lg font-semibold text-foreground">Estado de cuenta del consorcio</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Balance del periodo: saldo anterior + ingresos − egresos = saldo al cierre.
          </p>
        </header>
        <div className="p-5">
          <dl className="grid grid-cols-1 md:grid-cols-5 gap-3 text-sm">
            <Row label="Saldo anterior" value={<Money amount={run.cashStatement.previousBalance} />} />
            <Row label="Ingresos ord." value={<Money amount={run.cashStatement.ordinaryIncome} />} />
            <Row label="Ingresos ext." value={<Money amount={run.cashStatement.extraordinaryIncome} />} />
            <Row label="Egresos" tone="negative" value={<Money amount={-run.cashStatement.totalExpenses} />} />
            <Row
              label="Saldo al cierre"
              value={<Money amount={run.cashStatement.endingBalance} />}
              emphasize
              tone={run.cashStatement.endingBalance < 0 ? 'negative' : 'ok'}
            />
          </dl>
          <p className="text-[11px] text-muted-foreground mt-3 italic">
            Ingresos todavia en $ 0 — conectar cobranzas en Fase 4.
          </p>
        </div>
      </section>

      {/* ----- Detalle de egresos del periodo ----- */}
      <section className="glass-card rounded-2xl overflow-hidden">
        <header className="px-5 py-4 border-b border-border/40">
          <h2 className="font-serif text-lg font-semibold text-foreground">Egresos del periodo</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gastos imputados al cierre contable. {run.expenseLines.length} {run.expenseLines.length === 1 ? 'item' : 'items'}.
          </p>
        </header>
        {run.expenseLines.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            Sin egresos imputados. Aprobá los gastos y marcarlos como imputados.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border/40 bg-muted/30">
                <th className="text-left px-5 py-3 font-medium">Fecha</th>
                <th className="text-left px-5 py-3 font-medium">Descripcion</th>
                <th className="text-left px-5 py-3 font-medium">Proveedor</th>
                <th className="text-left px-5 py-3 font-medium">Cat.</th>
                <th className="text-left px-5 py-3 font-medium">Tipo</th>
                <th className="text-right px-5 py-3 font-medium">Monto</th>
              </tr>
            </thead>
            <tbody>
              {run.expenseLines.map((line) => (
                <tr key={line.id} className="border-b border-border/30 last:border-0 hover:bg-muted/40">
                  <td className="px-5 py-2.5 text-muted-foreground tabular-nums">{line.issuedAt ?? '—'}</td>
                  <td className="px-5 py-2.5">
                    <Link href={`/iadmin/gastos/${line.id}`} className="text-foreground hover:text-primary">
                      {line.description}
                    </Link>
                  </td>
                  <td className="px-5 py-2.5 text-muted-foreground">{line.providerName ?? '—'}</td>
                  <td className="px-5 py-2.5 text-muted-foreground">{line.category ?? '—'}</td>
                  <td className="px-5 py-2.5">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        line.kind === 'extraordinaria'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {line.kind === 'extraordinaria' ? 'Ext.' : 'Ord.'}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-foreground">
                    <Money amount={line.amount} />
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/40 font-medium">
                <td className="px-5 py-3" colSpan={5}>Total egresos</td>
                <td className="px-5 py-3 text-right tabular-nums text-foreground">
                  <Money
                    amount={run.expenseLines.reduce((s, l) => s + l.amount, 0)}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      {/* ----- Listado de consorcistas ----- */}
      <section className="glass-card rounded-2xl overflow-hidden">
        <header className="px-5 py-4 border-b border-border/40">
          <h2 className="font-serif text-lg font-semibold text-foreground">Listado de consorcistas</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Distribucion por unidad aplicando alicuota sobre cada tipo de expensa + saldo anterior.
          </p>
        </header>
        {run.items.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">Sin items.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border/40 bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium">Unidad</th>
                  <th className="text-left px-4 py-3 font-medium">Titular</th>
                  <th className="text-right px-4 py-3 font-medium">%</th>
                  <th className="text-right px-4 py-3 font-medium">Ordinaria</th>
                  <th className="text-right px-4 py-3 font-medium">Extraordinaria</th>
                  <th className="text-right px-4 py-3 font-medium">Saldo ant.</th>
                  <th className="text-right px-4 py-3 font-medium bg-primary/5">Subtotal</th>
                  <th className="text-right px-4 py-3 font-medium">Cobrado</th>
                  <th className="text-right px-4 py-3 font-medium">Saldo</th>
                  {run.dueDates.map((due) => (
                    <th
                      key={due.label}
                      className="text-right px-4 py-3 font-medium bg-primary/10"
                    >
                      {due.label}
                      <br />
                      <span className="text-[10px] font-normal text-muted-foreground">
                        {due.date}
                        {due.surchargePct > 0 ? ` · +${due.surchargePct}%` : ''}
                      </span>
                    </th>
                  ))}
                  {canCollect ? <th className="px-2 py-3" /> : null}
                </tr>
              </thead>
              <tbody>
                {run.items.map((item) => {
                  const isPaid = item.balanceRemaining < 0.01 && item.subtotal > 0
                  return (
                    <Fragment key={item.id}>
                      <tr
                        className={`border-b border-border/30 last:border-0 hover:bg-muted/40 ${isPaid ? 'bg-emerald-50/40' : ''}`}
                      >
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-foreground flex items-center gap-1.5">
                            {item.unitCode}
                            {isPaid ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : null}
                          </div>
                          <div className="text-[10px] text-muted-foreground capitalize">{item.unitKind}</div>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {item.activeHolderName ?? <span className="italic text-xs">sin titular</span>}
                          {item.activeHolderKind ? (
                            <div className="text-[10px] capitalize text-muted-foreground">{item.activeHolderKind}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                          {(item.prorataCoefficient * 100).toFixed(4)}%
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          <Money amount={item.ordinaryAmount} />
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {item.extraordinaryAmount > 0 ? <Money amount={item.extraordinaryAmount} /> : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {item.previousBalance !== 0 ? <Money amount={item.previousBalance} /> : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium bg-primary/5">
                          <Money amount={item.subtotal} />
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">
                          {item.collectedAmount > 0 ? <Money amount={item.collectedAmount} /> : '—'}
                        </td>
                        <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${item.balanceRemaining > 0.01 ? 'text-rose-700' : 'text-muted-foreground'}`}>
                          {item.balanceRemaining > 0.01 ? <Money amount={item.balanceRemaining} /> : '✓'}
                        </td>
                        {item.dueAmounts.map((due) => (
                          <td
                            key={due.label}
                            className="px-4 py-2.5 text-right tabular-nums bg-primary/5"
                          >
                            <Money amount={due.amount} />
                          </td>
                        ))}
                        {canCollect ? (
                          <td className="px-2 py-2.5">
                            <div className="flex flex-col gap-1 items-end">
                              {item.balanceRemaining > 0.01 ? (
                                <QuickPayButton
                                  itemId={item.id}
                                  unitCode={item.unitCode}
                                  holderName={item.activeHolderName}
                                  periodLabel={periodLabel}
                                  balanceRemaining={item.balanceRemaining}
                                  canShare={canShare}
                                  defaultAccount={defaultCashAccount}
                                  onEditClick={() => setCollectingItem(item)}
                                />
                              ) : null}
                              {canShare && item.subtotal > 0 ? (
                                <ShareLinkButton
                                  itemId={item.id}
                                  unitCode={item.unitCode}
                                  holderName={item.activeHolderName}
                                  amountToPay={item.balanceRemaining}
                                  periodLabel={periodLabel}
                                />
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                      {collectingItem?.id === item.id ? (
                        <tr>
                          <td colSpan={10 + run.dueDates.length + (canCollect ? 1 : 0)} className="p-3 bg-muted/20">
                            <RegisterCollectionForm
                              itemId={item.id}
                              unitCode={item.unitCode}
                              holderName={item.activeHolderName}
                              subtotal={item.subtotal}
                              balanceRemaining={item.balanceRemaining}
                              dueDates={run.dueDates}
                              cashAccounts={run.cashAccounts}
                              onDone={() => setCollectingItem(null)}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
                <tr className="bg-muted/50 font-medium text-[13px]">
                  <td className="px-4 py-3" colSpan={2}>TOTAL</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {(run.items.reduce((s, it) => s + it.prorataCoefficient, 0) * 100).toFixed(4)}%
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <Money amount={run.items.reduce((s, it) => s + it.ordinaryAmount, 0)} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <Money amount={run.items.reduce((s, it) => s + it.extraordinaryAmount, 0)} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <Money amount={run.items.reduce((s, it) => s + it.previousBalance, 0)} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums bg-primary/5">
                    <Money amount={run.items.reduce((s, it) => s + it.subtotal, 0)} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-700">
                    <Money amount={run.collectedTotal} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-rose-700">
                    <Money amount={run.balanceTotal} />
                  </td>
                  {run.dueDates.map((due, dueIdx) => (
                    <td key={due.label} className="px-4 py-3 text-right tabular-nums bg-primary/5">
                      <Money amount={run.items.reduce((s, it) => s + (it.dueAmounts[dueIdx]?.amount ?? 0), 0)} />
                    </td>
                  ))}
                  {canCollect ? <td /> : null}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ----- Recibos emitidos ----- */}
      {run.items.some((it) => it.payments.length > 0) ? (
        <section className="glass-card rounded-2xl overflow-hidden">
          <header className="px-5 py-4 border-b border-border/40">
            <h2 className="font-serif text-lg font-semibold text-foreground">Recibos emitidos</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pagos registrados contra esta liquidacion. {run.items.reduce((c, it) => c + it.payments.length, 0)} recibos.
            </p>
          </header>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border/40 bg-muted/30">
                <th className="text-left px-5 py-3 font-medium">N° Recibo</th>
                <th className="text-left px-5 py-3 font-medium">Fecha</th>
                <th className="text-left px-5 py-3 font-medium">Unidad</th>
                <th className="text-left px-5 py-3 font-medium">Cuenta</th>
                <th className="text-left px-5 py-3 font-medium">Ref.</th>
                <th className="text-right px-5 py-3 font-medium">Monto</th>
                {canVoid ? <th className="px-2 py-3" /> : null}
              </tr>
            </thead>
            <tbody>
              {run.items
                .flatMap((it) => it.payments.map((p) => ({ item: it, payment: p })))
                .sort((a, b) => b.payment.paidAt.localeCompare(a.payment.paidAt))
                .map(({ item, payment }) => (
                  <tr key={payment.id} className="border-b border-border/30 last:border-0 hover:bg-muted/40">
                    <td className="px-5 py-2.5 font-medium tabular-nums">{payment.receiptNumber ?? '—'}</td>
                    <td className="px-5 py-2.5 text-muted-foreground tabular-nums">{payment.paidAt}</td>
                    <td className="px-5 py-2.5">
                      {item.unitCode}
                      {item.activeHolderName ? <span className="text-xs text-muted-foreground"> · {item.activeHolderName}</span> : null}
                    </td>
                    <td className="px-5 py-2.5 text-muted-foreground">{payment.cashAccountName ?? '—'}</td>
                    <td className="px-5 py-2.5 text-muted-foreground text-xs">{payment.reference ?? '—'}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-medium text-emerald-700">
                      <Money amount={payment.amount} />
                    </td>
                    {canVoid ? (
                      <td className="px-2 py-2.5">
                        <VoidPaymentButton paymentId={payment.id} canVoid={canVoid} />
                      </td>
                    ) : null}
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {/* ----- Datos legales al pie (solo si existen) ----- */}
      {legal.bank || legal.insurance?.length || legal.amenities?.length || legal.collectionSchedule || legal.footerNotes || legal.accountantName ? (
        <section className="glass-card rounded-2xl p-5 space-y-4 text-sm">
          <header>
            <h2 className="font-serif text-lg font-semibold text-foreground flex items-center gap-2">
              <Info className="w-4 h-4" /> Informacion del consorcio
            </h2>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {legal.bank && (legal.bank.name || legal.bank.cbu || legal.bank.alias) ? (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Cuenta bancaria</div>
                {legal.bank.name ? <div>{legal.bank.name}</div> : null}
                {legal.bank.account ? <div>Cuenta: <span className="tabular-nums">{legal.bank.account}</span></div> : null}
                {legal.bank.cbu ? <div>CBU: <span className="tabular-nums">{legal.bank.cbu}</span></div> : null}
                {legal.bank.alias ? <div>Alias: {legal.bank.alias}</div> : null}
              </div>
            ) : null}

            {legal.collectionSchedule ? (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" /> Cobranza
                </div>
                <div className="whitespace-pre-line">{legal.collectionSchedule}</div>
              </div>
            ) : null}

            {legal.accountantName ? (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Administracion</div>
                <div>{legal.accountantName}</div>
                {legal.accountantPhone ? <div className="text-muted-foreground">{legal.accountantPhone}</div> : null}
                {legal.accountantEmail ? <div className="text-muted-foreground">{legal.accountantEmail}</div> : null}
              </div>
            ) : null}
          </div>

          {legal.insurance && legal.insurance.length > 0 ? (
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Seguros vigentes</div>
              <ul className="space-y-1 text-xs">
                {legal.insurance.map((ins, idx) => (
                  <li key={idx} className="rounded-md bg-muted/40 px-3 py-2">
                    <div className="text-foreground font-medium">
                      {ins.company ?? '—'}
                      {ins.policy ? <span className="text-muted-foreground font-normal"> · Poliza {ins.policy}</span> : null}
                    </div>
                    {ins.coverage ? <div className="text-muted-foreground mt-0.5">{ins.coverage}</div> : null}
                    {ins.from || ins.to ? (
                      <div className="text-muted-foreground mt-0.5">
                        Vigencia: {ins.from ?? '—'} a {ins.to ?? '—'}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {legal.amenities && legal.amenities.length > 0 ? (
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Amenities</div>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {legal.amenities.map((a, idx) => (
                  <li key={idx} className="rounded-md bg-muted/40 px-3 py-2 flex items-center justify-between">
                    <span className="text-foreground">{a.name ?? '—'}</span>
                    <span className="text-muted-foreground">
                      {a.price ? `Precio: ${a.price}` : ''}
                      {a.deposit ? ` · Dep: ${a.deposit}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {legal.footerNotes ? (
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Notas</div>
              <p className="whitespace-pre-line text-muted-foreground">{legal.footerNotes}</p>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

function Stat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: React.ReactNode
  icon: typeof Building2
  tone?: 'ok' | 'warning'
}) {
  return (
    <div className="glass-card rounded-2xl p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`mt-0.5 font-serif text-xl font-bold tabular-nums ${tone === 'warning' ? 'text-amber-700' : 'text-foreground'}`}>
          {value}
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  emphasize,
  tone,
}: {
  label: string
  value: React.ReactNode
  emphasize?: boolean
  tone?: 'ok' | 'negative'
}) {
  return (
    <div className={`rounded-xl p-3 ${emphasize ? 'bg-primary/10 border border-primary/30' : 'bg-muted/30'}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-serif text-lg font-bold tabular-nums ${tone === 'negative' ? 'text-rose-700' : 'text-foreground'}`}>
        {value}
      </div>
    </div>
  )
}
