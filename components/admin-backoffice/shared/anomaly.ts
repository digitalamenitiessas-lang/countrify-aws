/**
 * Detección client-side de anomalías por celda, usando los 12 meses que ya
 * vienen en el grid. Compara el monto actual con el promedio de los N meses
 * previos del MISMO rubro y determina si se aparta significativamente.
 *
 * No pega al server: el admin ve el badge en la tabla al cargar.
 */

import type { IAdminMonthlyGridRow } from '@/lib/types'

export type CellAnomaly = {
  kind: 'spike' | 'drop' | 'first'
  pct: number            // -100..+inf, con signo
  avgPrior: number       // promedio de los meses previos con dato
  message: string        // texto corto para tooltip / popover
  severity: 'soft' | 'hard'  // hard = +/- 50%, soft = +/- 25%
}

const LOOKBACK = 6       // meses previos a considerar
const MIN_SAMPLES = 2    // mínimo de montos previos para activar

export function detectCellAnomaly(
  row: IAdminMonthlyGridRow,
  year: number,
  month: number,
  amount: number | null,
): CellAnomaly | null {
  if (amount === null || amount <= 0) return null

  // Buscar índice de la celda actual en row.cells (ordenadas asc)
  const idx = row.cells.findIndex((c) => c.year === year && c.month === month)
  if (idx <= 0) return null

  // Tomar los LOOKBACK meses previos con dato (no contamos el mes actual)
  const prior: number[] = []
  for (let i = idx - 1; i >= 0 && prior.length < LOOKBACK; i--) {
    const c = row.cells[i]
    if (c.amount !== null && c.amount > 0) prior.push(c.amount)
  }

  if (prior.length === 0) {
    return {
      kind: 'first',
      pct: 0,
      avgPrior: 0,
      message: 'Primera vez que este rubro aparece con un monto cargado.',
      severity: 'soft',
    }
  }

  if (prior.length < MIN_SAMPLES) return null

  const avgPrior = prior.reduce((s, n) => s + n, 0) / prior.length
  if (avgPrior <= 0) return null

  const delta = (amount - avgPrior) / avgPrior
  const pct = Math.round(delta * 1000) / 10 // una decimal

  const absPct = Math.abs(pct)
  if (absPct < 25) return null

  const severity: 'soft' | 'hard' = absPct >= 50 ? 'hard' : 'soft'
  const kind: CellAnomaly['kind'] = delta > 0 ? 'spike' : 'drop'
  const direction = delta > 0 ? 'arriba' : 'debajo'
  const avgPretty = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(
    Math.round(avgPrior),
  )
  const message = `${Math.abs(pct).toFixed(0)}% ${direction} del promedio de los últimos ${prior.length} meses ($ ${avgPretty}).`

  return { kind, pct, avgPrior, message, severity }
}
