import { sumBankMovementsForAccountsFromPostgres } from '@/lib/db/iadmin-writes'

/**
 * Error de saldo insuficiente. Lleva `code = 'INSUFFICIENT_FUNDS'` y los montos
 * involucrados para que la UI pueda mostrar el detalle y ofrecer el override
 * ("permitir saldo negativo").
 */
export class InsufficientFundsError extends Error {
  code = 'INSUFFICIENT_FUNDS' as const
  balance: number
  outgoingAmount: number
  resultingBalance: number

  constructor(balance: number, outgoingAmount: number) {
    const after = Math.round((balance - outgoingAmount) * 100) / 100
    super(
      `Saldo insuficiente: la cuenta tiene $${balance.toLocaleString('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} y el egreso es $${outgoingAmount.toLocaleString('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}. Quedaría en $${after.toLocaleString('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}.`,
    )
    this.name = 'InsufficientFundsError'
    this.balance = balance
    this.outgoingAmount = outgoingAmount
    this.resultingBalance = after
  }
}

/**
 * Valida que la cuenta tenga saldo suficiente para un egreso. Si el egreso
 * dejaría el saldo en negativo y NO se pidió override (`allowOverdraft`),
 * lanza `InsufficientFundsError`.
 *
 * El saldo actual es la suma de todos los movimientos de la cuenta
 * (modelo de caja: balance = sum(amount)). `outgoingAmount` es la magnitud
 * (positiva) del egreso, no el monto firmado.
 */
export async function assertSufficientFunds(input: {
  cashAccountId: string
  outgoingAmount: number
  allowOverdraft?: boolean
}): Promise<void> {
  if (input.allowOverdraft) return
  if (!(input.outgoingAmount > 0)) return

  const balance = await sumBankMovementsForAccountsFromPostgres([input.cashAccountId])
  const after = Math.round((balance - input.outgoingAmount) * 100) / 100
  if (after < -0.01) {
    throw new InsufficientFundsError(balance, input.outgoingAmount)
  }
}
