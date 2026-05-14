'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  FileText,
  Info,
  TrendingDown,
  TrendingUp,
  UserCircle2,
} from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ExpensePreviewDialog } from '@/components/admin-backoffice/consorcio/expense-preview-dialog'
import type { CellAnomaly } from '@/components/admin-backoffice/shared/anomaly'
import type { IAdminExpenseStatus, IAdminMonthlyGridRow } from '@/lib/types'

type Cell = IAdminMonthlyGridRow['cells'][number]

type Props = {
  cell: Cell
  providerName: string
  anomaly?: CellAnomaly | null
  children: React.ReactNode
}

const STATUS_LABEL: Record<IAdminExpenseStatus, string> = {
  draft: 'Borrador',
  pending_review: 'En revisión',
  needs_doc: 'Falta documento',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  imputed: 'Imputado',
}

const STATUS_TONE: Record<IAdminExpenseStatus, string> = {
  draft: 'bg-amber-50 text-amber-900 border-amber-200',
  pending_review: 'bg-sky-50 text-sky-900 border-sky-200',
  needs_doc: 'bg-amber-50 text-amber-900 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-900 border-rose-200',
  imputed: 'bg-emerald-50 text-emerald-900 border-emerald-200',
}

function formatDateLong(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateShort(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function CellHistoryPopover({ cell, providerName, anomaly, children }: Props) {
  const [open, setOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const createdAt = formatDateLong(cell.createdAt)
  const updatedAt = formatDateLong(cell.updatedAt)
  const issuedAt = formatDateShort(cell.issuedAt)
  const wasEdited = cell.createdAt && cell.updatedAt && cell.createdAt !== cell.updatedAt
  const hasHistory = Boolean(cell.expenseId)

  if (!hasHistory) {
    return <>{children}</>
  }

  return (
    <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-80 p-0 overflow-hidden border border-border/60 shadow-lg"
        onKeyDown={(e) => {
          // Evitar que se propague al handler de teclado de la planilla
          e.stopPropagation()
        }}
      >
        <header className="px-4 py-3 bg-gradient-to-b from-primary/5 to-transparent border-b border-border/30">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
            Historial de celda
          </p>
          <h4 className="font-serif text-sm font-semibold text-foreground truncate mt-0.5">
            {providerName}
          </h4>
          {cell.status ? (
            <span
              className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_TONE[cell.status]}`}
            >
              {cell.status === 'imputed' || cell.status === 'approved' ? (
                <CheckCircle2 className="w-2.5 h-2.5" />
              ) : (
                <Info className="w-2.5 h-2.5" />
              )}
              {STATUS_LABEL[cell.status]}
            </span>
          ) : null}
        </header>

        <div className="px-4 py-3 space-y-2.5 text-xs">
          {cell.createdByName ? (
            <Row
              icon={<UserCircle2 className="w-3.5 h-3.5" />}
              label="Cargado por"
              value={cell.createdByName}
              subValue={createdAt ?? undefined}
            />
          ) : null}

          {wasEdited && updatedAt ? (
            <Row
              icon={<CalendarDays className="w-3.5 h-3.5" />}
              label="Última edición"
              value={updatedAt}
            />
          ) : null}

          {issuedAt ? (
            <Row
              icon={<CalendarDays className="w-3.5 h-3.5" />}
              label="Fecha de emisión"
              value={issuedAt}
            />
          ) : null}

          {cell.description ? (
            <Row
              icon={<Info className="w-3.5 h-3.5" />}
              label="Descripción"
              value={cell.description}
            />
          ) : null}
        </div>

        {anomaly ? <AnomalyRow anomaly={anomaly} /> : null}

        {cell.documentId && cell.documentName ? (
          <>
            <div className="divider-soft mx-4" />
            <div className="px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setPreviewOpen(true)
                }}
                className="w-full flex items-center gap-2 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs hover:border-primary/40 hover:bg-muted/30 transition-colors"
              >
                <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="flex-1 text-left min-w-0">
                  <span className="block font-medium text-foreground truncate">
                    {cell.documentName}
                  </span>
                  <span className="text-muted-foreground text-[10px]">Ver comprobante</span>
                </span>
              </button>
            </div>
          </>
        ) : null}
      </PopoverContent>
    </Popover>

    <ExpensePreviewDialog
      open={previewOpen}
      onOpenChange={setPreviewOpen}
      documentId={cell.documentId}
      fileName={cell.documentName}
      providerName={providerName}
      amount={cell.amount}
      issuedAt={cell.issuedAt}
    />
    </>
  )
}

function AnomalyRow({ anomaly }: { anomaly: CellAnomaly }) {
  const toneBg =
    anomaly.severity === 'hard'
      ? anomaly.kind === 'spike'
        ? 'bg-rose-50 border-rose-200 text-rose-900'
        : 'bg-emerald-50 border-emerald-200 text-emerald-900'
      : anomaly.kind === 'spike'
        ? 'bg-amber-50 border-amber-200 text-amber-900'
        : 'bg-emerald-50 border-emerald-200 text-emerald-900'
  const Icon = anomaly.kind === 'spike' ? TrendingUp : TrendingDown
  return (
    <div className={`mx-4 mb-3 rounded-lg border px-3 py-2 text-xs flex items-start gap-2 ${toneBg}`}>
      {anomaly.kind === 'first' ? (
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      ) : (
        <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      )}
      <span>{anomaly.message}</span>
    </div>
  )
}

function Row({
  icon,
  label,
  value,
  subValue,
}: {
  icon: React.ReactNode
  label: string
  value: string
  subValue?: string
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">
          {label}
        </p>
        <p className="text-foreground font-medium truncate">{value}</p>
        {subValue ? <p className="text-muted-foreground text-[10px]">{subValue}</p> : null}
      </div>
    </div>
  )
}
