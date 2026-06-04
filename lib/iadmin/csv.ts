// Helpers para generar CSV "Excel-friendly" (BOM UTF-8 para que abra
// correctamente con acentos en Excel ES-AR, comillas dobles para escapar
// campos con comas/saltos de linea).

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = typeof value === 'string' ? value : String(value)
  // Si el campo contiene comma, comilla doble, salto de linea o tab, hay
  // que envolverlo en comillas dobles y escapar las que tenga adentro.
  if (/[",\n\r\t]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function buildCsv(input: {
  headers: string[]
  rows: Array<Array<unknown>>
}): string {
  const lines: string[] = []
  lines.push(input.headers.map(escapeCell).join(','))
  for (const row of input.rows) {
    lines.push(row.map(escapeCell).join(','))
  }
  // BOM UTF-8 al inicio para que Excel detecte el encoding bien.
  return '﻿' + lines.join('\r\n') + '\r\n'
}

export function csvResponseHeaders(filenameBase: string): HeadersInit {
  const ts = new Date().toISOString().slice(0, 10)
  const filename = `${filenameBase}-${ts}.csv`
  return {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  }
}

// Formato es-AR: "23.750,50" (miles con punto, decimal con coma). Se
// usa para columnas numericas en los CSVs que abre el admin en Excel.
export function formatMoneyAr(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return ''
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
