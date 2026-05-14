'use client'

import { useMemo } from 'react'
import {
  BarChart3,
  FileUp,
  Home,
  ListTree,
  MessageSquare,
  Plus,
  Redo2,
  Search,
  Send,
  Settings2,
  Sparkles,
  TrendingUp,
  Undo2,
  UserCircle2,
  Wallet,
} from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'
import type { IAdminMesaState, IAdminMonthlyGrid } from '@/lib/types'

type Action = {
  id: string
  label: string
  hint?: string
  icon: typeof Home
  shortcut?: string
  disabled?: boolean
  run: () => void
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  grid: IAdminMonthlyGrid
  state: IAdminMesaState
  canEmit: boolean
  canManageRubros: boolean
  canUndo?: boolean
  canRedo?: boolean
  undoLabel?: string
  redoLabel?: string
  // Acciones que ejecuta la palette
  onOpenAssistant: () => void
  onOpenAssistantExtract: () => void
  onOpenAssistantAnnounce: () => void
  onToggleChart: () => void
  onFocusSearch: () => void
  onAddRubro: () => void
  onEmit: () => void
  onOpenUnit: (unitId: string) => void
  onJumpToProvider: (providerId: string) => void
  onOpenConfiguracion: () => void
  onOpenHelp: () => void
  onUndo?: () => void
  onRedo?: () => void
}

export function MesaCommandPalette({
  open,
  onOpenChange,
  grid,
  state,
  canEmit,
  canManageRubros,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  onOpenAssistant,
  onOpenAssistantExtract,
  onOpenAssistantAnnounce,
  onToggleChart,
  onFocusSearch,
  onAddRubro,
  onEmit,
  onOpenUnit,
  onJumpToProvider,
  onOpenConfiguracion,
  onOpenHelp,
  onUndo,
  onRedo,
}: Props) {
  const actions: Action[] = useMemo(() => {
    const list: Action[] = [
      ...(canUndo && onUndo
        ? [
            {
              id: 'undo',
              label: 'Deshacer última edición',
              hint: undoLabel,
              icon: Undo2,
              shortcut: '⌘Z',
              run: () => {
                onUndo()
                onOpenChange(false)
              },
            } satisfies Action,
          ]
        : []),
      ...(canRedo && onRedo
        ? [
            {
              id: 'redo',
              label: 'Rehacer',
              hint: redoLabel,
              icon: Redo2,
              shortcut: '⌘⇧Z',
              run: () => {
                onRedo()
                onOpenChange(false)
              },
            } satisfies Action,
          ]
        : []),
    ]
    return [
      ...list,
      {
        id: 'assistant-extract',
        label: 'Extraer factura con IA',
        hint: 'Subí un PDF o imagen y se imputa automático',
        icon: FileUp,
        run: () => {
          onOpenAssistantExtract()
          onOpenChange(false)
        },
      },
      {
        id: 'assistant',
        label: 'Abrir asistente IA',
        icon: Sparkles,
        shortcut: 'A',
        run: () => {
          onOpenAssistant()
          onOpenChange(false)
        },
      },
      {
        id: 'add-rubro',
        label: 'Agregar rubro',
        hint: 'Crear un proveedor recurrente',
        icon: Plus,
        shortcut: 'N',
        disabled: !canManageRubros,
        run: () => {
          onAddRubro()
          onOpenChange(false)
        },
      },
      {
        id: 'toggle-chart',
        label: 'Ver evolución anual',
        icon: BarChart3,
        run: () => {
          onToggleChart()
          onOpenChange(false)
        },
      },
      {
        id: 'focus-search',
        label: 'Buscar rubro en la planilla',
        icon: Search,
        shortcut: '/',
        run: () => {
          onFocusSearch()
          onOpenChange(false)
        },
      },
      {
        id: 'announce',
        label: 'Redactar comunicado con IA',
        icon: MessageSquare,
        run: () => {
          onOpenAssistantAnnounce()
          onOpenChange(false)
        },
      },
      {
        id: 'emit',
        label: 'Emitir y avisar a los residentes',
        icon: Send,
        shortcut: 'E',
        disabled: !canEmit || (!grid.readyToEmit && state.runStatus === null),
        run: () => {
          onEmit()
          onOpenChange(false)
        },
      },
      {
        id: 'config',
        label: 'Ir a Configuración',
        icon: Settings2,
        run: () => {
          onOpenConfiguracion()
          onOpenChange(false)
        },
      },
      {
        id: 'help',
        label: 'Atajos de teclado',
        icon: ListTree,
        shortcut: '?',
        run: () => {
          onOpenHelp()
          onOpenChange(false)
        },
      },
    ]
  }, [
    canEmit,
    canManageRubros,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    grid.readyToEmit,
    state.runStatus,
    onAddRubro,
    onEmit,
    onFocusSearch,
    onJumpToProvider,
    onOpenAssistant,
    onOpenAssistantAnnounce,
    onOpenAssistantExtract,
    onOpenChange,
    onOpenConfiguracion,
    onOpenHelp,
    onToggleChart,
    onUndo,
    onRedo,
  ])

  const units = state.units
  const rubros = grid.rows

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Acciones rápidas"
      description="Buscá rubros, unidades o ejecutá acciones"
    >
      <CommandInput placeholder="Buscar acción, rubro o unidad…" />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>

        <CommandGroup heading="Acciones">
          {actions.map((a) => {
            const Icon = a.icon
            return (
              <CommandItem
                key={a.id}
                value={`accion ${a.label} ${a.hint ?? ''}`}
                disabled={a.disabled}
                onSelect={() => !a.disabled && a.run()}
              >
                <Icon className="w-4 h-4 text-muted-foreground" />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="truncate">{a.label}</span>
                  {a.hint ? (
                    <span className="text-[10px] text-muted-foreground truncate">{a.hint}</span>
                  ) : null}
                </div>
                {a.shortcut ? <CommandShortcut>{a.shortcut}</CommandShortcut> : null}
              </CommandItem>
            )
          })}
        </CommandGroup>

        {rubros.length > 0 ? (
          <CommandGroup heading="Rubros">
            {rubros.map((r) => (
              <CommandItem
                key={r.providerId}
                value={`rubro ${r.providerName} ${r.category ?? ''}`}
                onSelect={() => {
                  onJumpToProvider(r.providerId)
                  onOpenChange(false)
                }}
              >
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="truncate">{r.providerName}</span>
                  {r.category ? (
                    <span className="text-[10px] text-muted-foreground truncate">{r.category}</span>
                  ) : null}
                </div>
                {r.lastAmount !== null ? (
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    $ {Math.round(r.lastAmount).toLocaleString('es-AR')}
                  </span>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {units.length > 0 ? (
          <CommandGroup heading="Unidades">
            {units.map((u) => (
              <CommandItem
                key={u.unitId}
                value={`unidad ${u.unitCode} ${u.holderName ?? ''}`}
                onSelect={() => {
                  onOpenUnit(u.unitId)
                  onOpenChange(false)
                }}
              >
                {u.balance > 0.01 ? (
                  <Wallet className="w-4 h-4 text-rose-600" />
                ) : (
                  <UserCircle2 className="w-4 h-4 text-emerald-600" />
                )}
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="truncate">
                    <span className="font-medium">Unidad {u.unitCode}</span>
                    {u.holderName ? <span className="text-muted-foreground"> · {u.holderName}</span> : null}
                  </span>
                  {u.balance > 0.01 ? (
                    <span className="text-[10px] text-rose-700 tabular-nums">
                      debe $ {Math.round(u.balance).toLocaleString('es-AR')}
                    </span>
                  ) : u.subtotal > 0 ? (
                    <span className="text-[10px] text-emerald-700">al día</span>
                  ) : null}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  )
}
