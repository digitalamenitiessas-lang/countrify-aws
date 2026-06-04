import { pgQuery } from '@/lib/db/postgres'

export type ExpenseAnomalySeverity = 'info' | 'warning' | 'danger'

export type ExpenseAnomaly = {
  code:
    | 'amount_spike'
    | 'amount_drop'
    | 'possible_duplicate'
    | 'missing_expected'
    | 'wrong_period'
    | 'first_time_provider'
  severity: ExpenseAnomalySeverity
  message: string
  reference?: Record<string, unknown>
}

export type AnomalyCheckInput = {
  managedPropertyId: string
  providerId?: string | null
  providerName?: string | null
  amount: number
  issuedAt?: string | null
  expenseKind?: 'ordinaria' | 'extraordinaria'
}

const SPIKE_THRESHOLD_PCT = 20
const DUP_WINDOW_DAYS = 30

function daysBetween(a: string, b: string): number {
  return Math.abs(Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000))
}

function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

export async function detectExpenseAnomalies(input: AnomalyCheckInput): Promise<ExpenseAnomaly[]> {
  const anomalies: ExpenseAnomaly[] = []

  // 1. Proveedor: por id o por nombre
  let providerId = input.providerId ?? null
  if (!providerId && input.providerName) {
    const prov = await pgQuery<{ id: string }>(
      `select id from countrify.iadmin_providers where lower(name) = lower($1) limit 1`,
      [input.providerName.trim()],
    )
    providerId = prov.rows[0]?.id ?? null
  }

  if (!providerId) {
    if (input.providerName && input.providerName.trim().length > 2) {
      anomalies.push({
        code: 'first_time_provider',
        severity: 'info',
        message: `Primera vez que cargás "${input.providerName.trim()}" como proveedor.`,
      })
    }
    return anomalies
  }

  // 2. Histórico del proveedor en este consorcio: últimos 6 gastos no rechazados
  const history = await pgQuery<{ id: string; amount: string; issued_at: string | null }>(
    `
      select id, amount::text as amount, issued_at::text as issued_at
      from countrify.iadmin_expenses
      where managed_property_id = $1
        and provider_id = $2
        and status <> 'rejected'
      order by issued_at desc nulls last
      limit 6
    `,
    [input.managedPropertyId, providerId],
  )
  const rows = history.rows

  if (rows.length === 0) {
    anomalies.push({
      code: 'first_time_provider',
      severity: 'info',
      message: `Primera vez que este proveedor aparece en este consorcio.`,
    })
    return anomalies
  }

  // 3. Amount spike / drop: comparar con promedio
  const avg = rows.reduce((s: any, r: any) => s + Number(r.amount), 0) / rows.length
  if (avg > 0 && input.amount > 0) {
    const pct = ((input.amount - avg) / avg) * 100
    if (pct >= SPIKE_THRESHOLD_PCT) {
      anomalies.push({
        code: 'amount_spike',
        severity: pct >= 50 ? 'danger' : 'warning',
        message: `Monto ${pct.toFixed(0)}% arriba del promedio (${formatARS(avg)}). Última factura: ${formatARS(Number(rows[0].amount))}.`,
        reference: { averageAmount: avg, lastAmount: Number(rows[0].amount) },
      })
    } else if (pct <= -SPIKE_THRESHOLD_PCT) {
      anomalies.push({
        code: 'amount_drop',
        severity: 'info',
        message: `Monto ${Math.abs(pct).toFixed(0)}% debajo del promedio (${formatARS(avg)}). Verificá que no falte algún rubro.`,
        reference: { averageAmount: avg },
      })
    }
  }

  // 4. Duplicado: mismo proveedor + mismo monto (±1%) + dentro de 30 días
  const sameMonth = rows.find(
    (r: any) =>
      Math.abs(Number(r.amount) - input.amount) / Math.max(input.amount, 1) < 0.01 &&
      input.issuedAt &&
      r.issued_at &&
      daysBetween(input.issuedAt, r.issued_at) <= DUP_WINDOW_DAYS,
  )
  if (sameMonth) {
    anomalies.push({
      code: 'possible_duplicate',
      severity: 'danger',
      message: `Hay otro gasto del mismo proveedor por ${formatARS(Number(sameMonth.amount))} emitido el ${sameMonth.issued_at}. ¿Es el mismo?`,
      reference: { otherExpenseId: sameMonth.id },
    })
  }

  // 5. Periodo equivocado
  if (input.issuedAt) {
    const now = new Date()
    const issued = new Date(input.issuedAt)
    const monthsAway = (now.getFullYear() - issued.getFullYear()) * 12 + (now.getMonth() - issued.getMonth())
    if (monthsAway >= 2) {
      anomalies.push({
        code: 'wrong_period',
        severity: 'warning',
        message: `La factura es de hace ${monthsAway} meses. Se va a imputar al período abierto del mes en curso.`,
      })
    }
  }

  return anomalies
}
