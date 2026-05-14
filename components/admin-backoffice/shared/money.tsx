export function Money({
  amount,
  currency = 'ARS',
  minimumFractionDigits = 2,
  maximumFractionDigits = 2,
}: {
  amount: number
  currency?: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
}) {
  const formatter = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
  })
  return <span className="tabular-nums">{formatter.format(amount)}</span>
}
