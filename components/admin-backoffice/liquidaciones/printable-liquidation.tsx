import type { IAdminExpenseLineInRun, IAdminLiquidationRunDetail } from '@/lib/types'

const MONTH_NAMES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
]

function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function formatNum(n: number, frac = 2): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: frac,
    maximumFractionDigits: frac,
  }).format(n)
}

export function PrintableLiquidation({ run }: { run: IAdminLiquidationRunDetail }) {
  const month = MONTH_NAMES[run.periodMonth - 1] ?? ''
  const legal = { ...run.administrationLegalInfo, ...run.propertyLegalInfo }

  return (
    <>
      <style>{`
        @page { size: A4 landscape; margin: 10mm; }
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .page-break { page-break-after: always; break-after: page; }
        .print-table { border-collapse: collapse; width: 100%; font-size: 9px; }
        .print-table th, .print-table td { border: 1px solid #666; padding: 3px 5px; vertical-align: middle; }
        .print-table th { background: #e5e7eb; font-weight: 600; text-align: left; }
        .print-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .print-table tbody tr:nth-child(even) td { background: #fafafa; }
      `}</style>

      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm">
        <div className="text-amber-900">
          Vista imprimible. Usa Cmd/Ctrl+P → &quot;Guardar como PDF&quot; o imprimí directo. Orientación: horizontal.
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md bg-primary text-primary-foreground px-3 py-1 text-xs font-medium"
        >
          Imprimir ahora
        </button>
      </div>

      <div className="max-w-[297mm] mx-auto p-4 space-y-4">
        <HeaderSection run={run} month={month} />

        {/* HOJA 1: Listado de consorcistas */}
        <ConsorcistasTable run={run} />

        <div className="page-break" />

        {/* HOJA 2: Estado de cuenta del consorcio */}
        <StatementPage run={run} month={month} legal={legal} />
      </div>
    </>
  )
}

function HeaderSection({ run, month }: { run: IAdminLiquidationRunDetail; month: string }) {
  return (
    <header className="border-2 border-black p-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold uppercase">Consorcio de Propietarios: {run.managedPropertyName}</h1>
          <div className="text-xs">{run.managedPropertyAddress}</div>
          <div className="text-sm font-semibold mt-1">
            Listado de Consorcistas — Expensas del mes de {month} de {run.periodYear}
          </div>
        </div>
        <div className="text-right text-xs">
          {run.dueDates.map((d) => (
            <div key={d.label}>
              <span className="font-semibold uppercase">{d.label}:</span> {d.date}
              {d.surchargePct > 0 ? ` (+${d.surchargePct}%)` : ''}
            </div>
          ))}
          <div className="mt-1">
            <span className="font-semibold">Generada:</span> {run.generatedAt.slice(0, 10)}
            {run.generatedByName ? ` · ${run.generatedByName}` : ''}
          </div>
        </div>
      </div>
    </header>
  )
}

function ConsorcistasTable({ run }: { run: IAdminLiquidationRunDetail }) {
  return (
    <table className="print-table">
      <thead>
        <tr>
          <th>U</th>
          <th>Depto</th>
          <th className="num">%</th>
          <th>Propietario/Inquilino</th>
          <th className="num">Expensas {run.periodMonth}/{run.periodYear}</th>
          <th className="num">Extraord.</th>
          <th className="num">Saldo ant.</th>
          <th className="num" style={{ background: '#dbeafe' }}>Subtotal</th>
          <th className="num" style={{ background: '#dcfce7' }}>Cobrado</th>
          <th className="num" style={{ background: '#fee2e2' }}>Saldo</th>
          {run.dueDates.map((d) => (
            <th key={d.label} className="num" style={{ background: '#fef3c7' }}>
              {d.label}
              <br />
              <span style={{ fontSize: '8px', fontWeight: 400 }}>{d.date}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {run.items.map((item, idx) => (
          <tr key={item.id}>
            <td className="num" style={{ width: '3%' }}>{idx + 1}</td>
            <td style={{ width: '8%' }}>
              <div className="font-semibold">{item.unitCode}</div>
              <div style={{ fontSize: '8px', color: '#666' }}>{item.unitKind}</div>
            </td>
            <td className="num" style={{ width: '5%' }}>{formatNum(item.prorataCoefficient * 100, 4)}%</td>
            <td style={{ width: '18%' }}>
              {item.activeHolderName ?? <span style={{ fontStyle: 'italic', color: '#999' }}>—</span>}
            </td>
            <td className="num">{formatARS(item.ordinaryAmount)}</td>
            <td className="num">{item.extraordinaryAmount > 0 ? formatARS(item.extraordinaryAmount) : '—'}</td>
            <td className="num">{item.previousBalance !== 0 ? formatARS(item.previousBalance) : '—'}</td>
            <td className="num" style={{ background: '#eff6ff', fontWeight: 600 }}>{formatARS(item.subtotal)}</td>
            <td className="num" style={{ background: '#f0fdf4', color: '#166534' }}>
              {item.collectedAmount > 0 ? formatARS(item.collectedAmount) : '—'}
            </td>
            <td className="num" style={{ background: '#fef2f2', color: item.balanceRemaining > 0 ? '#991b1b' : '#666' }}>
              {item.balanceRemaining > 0.01 ? formatARS(item.balanceRemaining) : '✓'}
            </td>
            {item.dueAmounts.map((due) => (
              <td key={due.label} className="num" style={{ background: '#fffbeb' }}>
                {formatARS(due.amount)}
              </td>
            ))}
          </tr>
        ))}
        <tr style={{ background: '#e5e7eb', fontWeight: 700 }}>
          <td colSpan={3} className="num">TOTAL</td>
          <td>{run.items.length} unidades</td>
          <td className="num">{formatARS(run.items.reduce((s, i) => s + i.ordinaryAmount, 0))}</td>
          <td className="num">{formatARS(run.items.reduce((s, i) => s + i.extraordinaryAmount, 0))}</td>
          <td className="num">{formatARS(run.items.reduce((s, i) => s + i.previousBalance, 0))}</td>
          <td className="num" style={{ background: '#dbeafe' }}>{formatARS(run.items.reduce((s, i) => s + i.subtotal, 0))}</td>
          <td className="num" style={{ background: '#dcfce7' }}>{formatARS(run.collectedTotal)}</td>
          <td className="num" style={{ background: '#fee2e2' }}>{formatARS(run.balanceTotal)}</td>
          {run.dueDates.map((due, idx) => (
            <td key={due.label} className="num" style={{ background: '#fef3c7' }}>
              {formatARS(run.items.reduce((s, i) => s + (i.dueAmounts[idx]?.amount ?? 0), 0))}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  )
}

function StatementPage({
  run,
  month,
  legal,
}: {
  run: IAdminLiquidationRunDetail
  month: string
  legal: IAdminLiquidationRunDetail['administrationLegalInfo']
}) {
  const ordinaryExpenses = run.expenseLines.filter((l) => l.kind === 'ordinaria')
  const extraordinaryExpenses = run.expenseLines.filter((l) => l.kind === 'extraordinaria')

  return (
    <div className="space-y-3">
      <div className="text-center">
        <h2 className="text-base font-bold uppercase">
          Estado de cuenta por ingresos de expensas y gastos comunes
        </h2>
        <div className="text-sm font-semibold uppercase">
          Correspondientes al mes de {month} de {run.periodYear}
        </div>
      </div>

      {/* Resumen A/B */}
      <table className="print-table" style={{ fontSize: '10px' }}>
        <tbody>
          <tr>
            <td colSpan={2} style={{ fontWeight: 700, background: '#e5e7eb' }}>
              SALDO DE CAJA DEL MES ANTERIOR
            </td>
            <td className="num" style={{ fontWeight: 700, background: '#e5e7eb', width: '25%' }}>
              {formatARS(run.cashStatement.previousBalance)}
            </td>
          </tr>
          <tr>
            <td style={{ fontWeight: 700, width: '5%' }}>A)</td>
            <td style={{ fontWeight: 700 }}>INGRESOS:</td>
            <td></td>
          </tr>
          <tr>
            <td></td>
            <td>Cobranza de expensas ordinarias {month.toLowerCase()} de {run.periodYear}</td>
            <td className="num">{formatARS(run.cashStatement.ordinaryIncome)}</td>
          </tr>
          <tr>
            <td></td>
            <td>Cobranza de expensas extraordinarias {month.toLowerCase()} de {run.periodYear}</td>
            <td className="num">{formatARS(run.cashStatement.extraordinaryIncome)}</td>
          </tr>
          <tr>
            <td></td>
            <td style={{ fontWeight: 700, background: '#f3f4f6' }}>TOTAL DE INGRESOS</td>
            <td className="num" style={{ fontWeight: 700, background: '#f3f4f6' }}>
              {formatARS(run.cashStatement.totalIncome + run.cashStatement.previousBalance)}
            </td>
          </tr>
          <tr>
            <td style={{ fontWeight: 700 }}>B)</td>
            <td style={{ fontWeight: 700 }}>EGRESOS:</td>
            <td></td>
          </tr>
        </tbody>
      </table>

      {/* Detalle egresos ordinarios */}
      {ordinaryExpenses.length > 0 ? (
        <table className="print-table" style={{ fontSize: '10px' }}>
          <tbody>
            {ordinaryExpenses.map((e) => (
              <ExpenseRow key={e.id} line={e} />
            ))}
            <tr style={{ fontWeight: 700, background: '#f3f4f6' }}>
              <td>Total egresos ordinarios</td>
              <td></td>
              <td className="num">
                {formatARS(ordinaryExpenses.reduce((s, e) => s + e.amount, 0))}
              </td>
            </tr>
          </tbody>
        </table>
      ) : null}

      {/* Detalle egresos extraordinarios */}
      {extraordinaryExpenses.length > 0 ? (
        <>
          <div className="text-center text-sm font-semibold uppercase mt-2">
            Detalle de expensas extraordinarias
          </div>
          <table className="print-table" style={{ fontSize: '10px' }}>
            <tbody>
              {extraordinaryExpenses.map((e) => (
                <ExpenseRow key={e.id} line={e} />
              ))}
              <tr style={{ fontWeight: 700, background: '#f3f4f6' }}>
                <td>Total egresos extraordinarios</td>
                <td></td>
                <td className="num">
                  {formatARS(extraordinaryExpenses.reduce((s, e) => s + e.amount, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      ) : null}

      {/* Balance final */}
      <table className="print-table" style={{ fontSize: '10px' }}>
        <tbody>
          <tr>
            <td colSpan={2} style={{ fontWeight: 700, background: '#e5e7eb' }}>
              TOTAL DE EGRESOS
            </td>
            <td className="num" style={{ fontWeight: 700, background: '#e5e7eb', width: '25%' }}>
              {formatARS(run.cashStatement.totalExpenses)}
            </td>
          </tr>
          <tr>
            <td colSpan={2} style={{ fontWeight: 700, background: '#dbeafe' }}>
              EXISTENCIA DE DINERO EN CAJA (EXP. ORDINARIAS Y EXTRAORDINARIAS)
            </td>
            <td className="num" style={{ fontWeight: 700, background: '#dbeafe' }}>
              {formatARS(run.cashStatement.endingBalance)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Datos legales al pie */}
      {legal.bank || legal.accountantName || legal.collectionSchedule || legal.insurance?.length ? (
        <div className="mt-4 border-2 border-black p-3 text-xs space-y-2" style={{ fontSize: '9px' }}>
          {legal.collectionSchedule ? (
            <div>
              <span className="font-semibold uppercase">Cobranzas en el country:</span>{' '}
              <span style={{ whiteSpace: 'pre-line' }}>{legal.collectionSchedule}</span>
            </div>
          ) : null}
          {legal.bank ? (
            <div>
              <span className="font-semibold uppercase">Cuenta bancaria:</span>{' '}
              {legal.bank.name ? `${legal.bank.name}` : ''}
              {legal.bank.account ? ` · Cuenta: ${legal.bank.account}` : ''}
              {legal.bank.cbu ? ` · CBU: ${legal.bank.cbu}` : ''}
              {legal.bank.alias ? ` · Alias: ${legal.bank.alias}` : ''}
            </div>
          ) : null}
          {legal.amenities && legal.amenities.length > 0 ? (
            <div>
              <span className="font-semibold uppercase">Reserva de amenities:</span>{' '}
              {legal.amenities
                .map((a) => `${a.name ?? ''}${a.price ? ` ${a.price}` : ''}${a.deposit ? ` (garantía ${a.deposit})` : ''}`)
                .filter(Boolean)
                .join(' · ')}
            </div>
          ) : null}
          {legal.insurance && legal.insurance.length > 0 ? (
            <div>
              <span className="font-semibold uppercase">Seguros vigentes:</span>{' '}
              {legal.insurance.map((i, idx) => (
                <span key={idx}>
                  {idx > 0 ? ' · ' : ''}
                  {i.company}{i.policy ? ` (Póliza ${i.policy})` : ''}{i.to ? ` — vig. hasta ${i.to}` : ''}
                </span>
              ))}
            </div>
          ) : null}
          {legal.footerNotes ? (
            <div style={{ whiteSpace: 'pre-line' }}>{legal.footerNotes}</div>
          ) : null}
          {legal.accountantName ? (
            <div className="text-right mt-4">
              <div>_________________________</div>
              <div className="font-semibold">{legal.accountantName}</div>
              {legal.accountantPhone ? <div>Cel: {legal.accountantPhone}</div> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function ExpenseRow({ line }: { line: IAdminExpenseLineInRun }) {
  const description =
    line.providerName && !line.description.toLowerCase().includes(line.providerName.toLowerCase())
      ? `${line.providerName} — ${line.description}`
      : line.description
  return (
    <tr>
      <td style={{ width: '15%' }}>{line.issuedAt ?? '—'}</td>
      <td>{description}</td>
      <td className="num" style={{ width: '20%' }}>{formatARS(line.amount)}</td>
    </tr>
  )
}
