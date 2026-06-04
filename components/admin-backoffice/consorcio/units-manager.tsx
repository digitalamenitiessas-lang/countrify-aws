'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, FileSpreadsheet, Pencil, Sparkles, UploadCloud, UserCheck, UserPlus, Users, UserX } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { IAdminHolderKind, IAdminLinkableProfile, IAdminUnitKind, IAdminUnitWithHolders } from '@/lib/types'
import {
  createAccessForHolder,
  createUnitUser,
  createUnit,
  createUnitHolder,
  deactivateUnitMembership,
  deactivateUnit,
  endUnitHolder,
  linkExistingProfileToUnit,
  updateUnit,
} from '@/app/iadmin/consorcios/[id]/actions'

type Props = {
  propertyId: string
  units: IAdminUnitWithHolders[]
  linkableProfiles: IAdminLinkableProfile[]
  canManageUnits: boolean
  canManageHolders: boolean
}

const UNIT_KIND_OPTIONS: Array<{ value: IAdminUnitKind; label: string }> = [
  { value: 'departamento', label: 'Departamento' },
  { value: 'casa', label: 'Casa' },
  { value: 'local', label: 'Local' },
  { value: 'cochera', label: 'Cochera' },
  { value: 'baulera', label: 'Baulera' },
  { value: 'otro', label: 'Otro' },
]

const HOLDER_KIND_OPTIONS: Array<{ value: IAdminHolderKind; label: string }> = [
  { value: 'propietario', label: 'Propietario' },
  { value: 'inquilino', label: 'Inquilino' },
  { value: 'apoderado', label: 'Apoderado' },
  { value: 'otro', label: 'Otro' },
]

const UNIT_USER_OPTIONS = [
  { value: 'vecino_principal', label: 'Vecino principal (responsable de pago)' },
  { value: 'vecino_adicional', label: 'Vecino adicional / familia' },
] as const

type UnitDraft = {
  code: string
  kind: IAdminUnitKind
  floor: string
  surfaceM2: string
  prorataPct: string // guardamos como "12.5" (%), se convierte a 0.125 al enviar
}

const emptyUnitDraft: UnitDraft = { code: '', kind: 'departamento', floor: '', surfaceM2: '', prorataPct: '' }

type UnitsConfirmAction =
  | { type: 'deactivate_unit'; unitId: string }
  | { type: 'end_holder'; holderId: string }
  | { type: 'deactivate_membership'; membershipId: string }

function unitToDraft(unit: IAdminUnitWithHolders): UnitDraft {
  return {
    code: unit.code,
    kind: unit.kind,
    floor: unit.floor ?? '',
    surfaceM2: unit.surfaceM2?.toString() ?? '',
    prorataPct: unit.prorataCoefficient !== null ? (unit.prorataCoefficient * 100).toString() : '',
  }
}

function parseDraft(draft: UnitDraft) {
  const surface = draft.surfaceM2.trim() ? Number(draft.surfaceM2.replace(',', '.')) : null
  const pctRaw = draft.prorataPct.trim() ? Number(draft.prorataPct.replace(',', '.')) : null
  const prorata = pctRaw !== null ? pctRaw / 100 : null

  if (surface !== null && (!Number.isFinite(surface) || surface < 0)) {
    throw new Error('Superficie invalida')
  }
  if (prorata !== null && (!Number.isFinite(prorata) || prorata < 0 || prorata > 1)) {
    throw new Error('Alicuota debe ser 0-100%')
  }
  if (!draft.code.trim()) {
    throw new Error('Codigo de unidad obligatorio')
  }

  return {
    code: draft.code.trim(),
    kind: draft.kind,
    floor: draft.floor.trim() || null,
    surfaceM2: surface,
    prorataCoefficient: prorata,
  }
}

export function UnitsManager({ propertyId, units, linkableProfiles, canManageUnits, canManageHolders }: Props) {
  const [pending, startTransition] = useTransition()
  const [confirmAction, setConfirmAction] = useState<UnitsConfirmAction | null>(null)
  const [creating, setCreating] = useState(false)
  const [newDraft, setNewDraft] = useState<UnitDraft>(emptyUnitDraft)
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<UnitDraft>(emptyUnitDraft)
  const [expandedUnitId, setExpandedUnitId] = useState<string | null>(null)
  const [addingHolderFor, setAddingHolderFor] = useState<string | null>(null)
  const [addingUserFor, setAddingUserFor] = useState<string | null>(null)
  // Contacto (holder) para el que se está por crear el acceso/login.
  const [accessDraft, setAccessDraft] = useState<{ holderId: string; isResponsableDePago: boolean } | null>(null)
  const [holderDraft, setHolderDraft] = useState({
    fullName: '',
    holderKind: 'propietario' as IAdminHolderKind,
    taxId: '',
    email: '',
    phone: '',
    startDate: '',
    replaceActive: true,
  })
  const [userDraft, setUserDraft] = useState({
    relationshipType: 'vecino_principal' as (typeof UNIT_USER_OPTIONS)[number]['value'],
    holderKind: 'propietario' as IAdminHolderKind,
    fullName: '',
    email: '',
    phone: '',
    password: 'Countrify2026!',
    isPrimaryOwner: true,
  })
  const [linkDraft, setLinkDraft] = useState({
    search: '',
    profileId: '',
    relationshipType: 'vecino_principal' as (typeof UNIT_USER_OPTIONS)[number]['value'],
    isPrimaryOwner: false,
  })

  function submitNewUnit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const parsed = parseDraft(newDraft)
      startTransition(async () => {
        try {
          await createUnit({ propertyId, ...parsed })
          toast.success('Unidad creada')
          setCreating(false)
          setNewDraft(emptyUnitDraft)
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Error')
        }
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error')
    }
  }

  function submitEditUnit(event: React.FormEvent<HTMLFormElement>, unitId: string) {
    event.preventDefault()
    try {
      const parsed = parseDraft(editDraft)
      startTransition(async () => {
        try {
          await updateUnit({ unitId, ...parsed })
          toast.success('Unidad actualizada')
          setEditingUnitId(null)
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Error')
        }
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error')
    }
  }

  function handleDeactivate(unitId: string) {
    setConfirmAction({ type: 'deactivate_unit', unitId })
  }

  function executeDeactivate(unitId: string) {
    startTransition(async () => {
      try {
        await deactivateUnit({ unitId })
        toast.success('Unidad desactivada')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  function resetHolderDraft() {
    setHolderDraft({
      fullName: '',
      holderKind: 'propietario',
      taxId: '',
      email: '',
      phone: '',
      startDate: '',
      replaceActive: true,
    })
    setAddingHolderFor(null)
  }

  function submitHolder(event: React.FormEvent<HTMLFormElement>, unitId: string) {
    event.preventDefault()
    if (!holderDraft.fullName.trim()) {
      toast.error('Nombre obligatorio')
      return
    }
    startTransition(async () => {
      try {
        await createUnitHolder({
          unitId,
          fullName: holderDraft.fullName.trim(),
          holderKind: holderDraft.holderKind,
          taxId: holderDraft.taxId.trim() || null,
          email: holderDraft.email.trim() || null,
          phone: holderDraft.phone.trim() || null,
          startDate: holderDraft.startDate || null,
          replaceActive: holderDraft.replaceActive,
        })
        toast.success('Titular agregado')
        resetHolderDraft()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  function handleEndHolder(holderId: string) {
    setConfirmAction({ type: 'end_holder', holderId })
  }

  function executeEndHolder(holderId: string) {
    startTransition(async () => {
      try {
        await endUnitHolder({ holderId })
        toast.success('Titular finalizado')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  function resetUserDraft() {
    setUserDraft({
      relationshipType: 'vecino_principal',
      holderKind: 'propietario',
      fullName: '',
      email: '',
      phone: '',
      password: 'Countrify2026!',
      isPrimaryOwner: true,
    })
    setLinkDraft({ search: '', profileId: '', relationshipType: 'vecino_principal', isPrimaryOwner: false })
    setAddingUserFor(null)
  }

  function submitLinkExisting(event: React.FormEvent<HTMLFormElement>, unitId: string) {
    event.preventDefault()
    if (!linkDraft.profileId) {
      toast.error('Seleccioná un vecino')
      return
    }
    startTransition(async () => {
      try {
        await linkExistingProfileToUnit({
          unitId,
          profileId: linkDraft.profileId,
          relationshipType: linkDraft.relationshipType,
          isPrimaryOwner: linkDraft.isPrimaryOwner,
        })
        toast.success('Vecino vinculado a la unidad')
        resetUserDraft()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  function submitUnitUser(event: React.FormEvent<HTMLFormElement>, unitId: string) {
    event.preventDefault()
    startTransition(async () => {
      try {
        await createUnitUser({
          unitId,
          relationshipType: userDraft.relationshipType,
          holderKind: userDraft.holderKind,
          fullName: userDraft.fullName.trim(),
          email: userDraft.email.trim(),
          phone: userDraft.phone.trim() || null,
          password: userDraft.password,
          isPrimaryOwner: userDraft.isPrimaryOwner,
        })
        toast.success('Usuario vinculado a la unidad')
        resetUserDraft()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  function submitCreateAccess() {
    if (!accessDraft) return
    const draft = accessDraft
    startTransition(async () => {
      try {
        await createAccessForHolder({
          holderId: draft.holderId,
          isResponsableDePago: draft.isResponsableDePago,
        })
        toast.success('Acceso creado: se envió la contraseña temporal por mail')
        setAccessDraft(null)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  function handleDeactivateMembership(membershipId: string) {
    setConfirmAction({ type: 'deactivate_membership', membershipId })
  }

  function executeDeactivateMembership(membershipId: string) {
    startTransition(async () => {
      try {
        await deactivateUnitMembership({ membershipId })
        toast.success('Usuario desvinculado')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  const totalProrata = units.filter((u) => u.isActive).reduce((sum, u) => sum + (u.prorataCoefficient ?? 0), 0)
  const confirmCopy =
    confirmAction?.type === 'deactivate_unit'
      ? {
          title: 'Desactivar unidad',
          description: 'La unidad quedara inactiva y fuera de futuras liquidaciones.',
          actionLabel: 'Si, desactivar',
        }
      : confirmAction?.type === 'end_holder'
        ? {
            title: 'Finalizar titular',
            description: 'El titular pasara al historico con fecha de fin de hoy.',
            actionLabel: 'Si, finalizar',
          }
        : confirmAction?.type === 'deactivate_membership'
          ? {
              title: 'Desvincular usuario',
              description: 'El usuario dejara de estar vinculado a esta unidad.',
              actionLabel: 'Si, desvincular',
            }
          : null

  function confirmCurrentAction() {
    if (!confirmAction) return
    if (confirmAction.type === 'deactivate_unit') {
      executeDeactivate(confirmAction.unitId)
    } else if (confirmAction.type === 'end_holder') {
      executeEndHolder(confirmAction.holderId)
    } else {
      executeDeactivateMembership(confirmAction.membershipId)
    }
    setConfirmAction(null)
  }

  return (
    <>
    <div className="space-y-4">
      {totalProrata > 1.0001 ? (
        <div className="rounded-lg border-2 border-rose-400 bg-rose-50 p-4 text-sm text-rose-900">
          <div className="font-semibold mb-1">⛔ Alícuotas superan 100% ({(totalProrata * 100).toFixed(2)}%)</div>
          <p className="text-xs">
            El sistema bloquea cargar gastos, emitir liquidaciones y registrar cobranzas hasta que las
            alícuotas de las unidades activas sumen como máximo 100%. Editá las unidades de abajo para corregirlo.
          </p>
        </div>
      ) : null}
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {units.length} unidades · suma de alicuotas activas:{' '}
          <span
            className={`font-medium tabular-nums ${
              totalProrata > 1.0001 ? 'text-rose-700' : ''
            }`}
          >
            {(totalProrata * 100).toFixed(2)}%
          </span>
          {totalProrata > 1.0001 ? (
            <span className="ml-2 text-rose-700 font-semibold">⛔ supera 100%</span>
          ) : totalProrata > 0 && Math.abs(totalProrata - 1) > 0.001 ? (
            <span className="ml-2 text-amber-700">⚠ deberia sumar 100%</span>
          ) : null}
        </div>
        {(canManageUnits || canManageHolders) && !creating ? (
          <div className="flex items-center gap-2 flex-wrap">
            {canManageUnits ? (
              <Link
                href={`/iadmin/consorcios/${propertyId}/importar`}
                className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
                title="Subir Excel/CSV con todas las unidades de una vez"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Importar Excel
              </Link>
            ) : null}
            {canManageHolders ? (
              <Link
                href={`/iadmin/consorcios/${propertyId}/vecinos-masivo`}
                className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
                title="Cargar vecinos pegando una tabla (unidad, nombre, email, relación)"
              >
                <Users className="w-3.5 h-3.5" />
                Carga masiva de vecinos
              </Link>
            ) : null}
            {canManageUnits ? (
              <Button size="sm" onClick={() => setCreating(true)}>Nueva unidad</Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Promo de import masivo cuando la lista está vacía */}
      {canManageUnits && !creating && units.length === 0 ? (
        <div className="glass-card rounded-2xl border-dashed border-2 border-primary/30 p-6 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-semibold text-foreground">
              ¿Ya tenés tu cartera en Excel?
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
              Subí tu planilla y la IA mapea automáticamente las columnas a unidades y titulares.
              Sin retipear nada — después solo revisás y completás lo que falte.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
            <Link
              href={`/iadmin/consorcios/${propertyId}/importar`}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Importar desde Excel
            </Link>
            <Button size="sm" variant="ghost" onClick={() => setCreating(true)}>
              o crear una unidad manualmente
            </Button>
          </div>
        </div>
      ) : null}

      {creating ? (
        <form onSubmit={submitNewUnit} className="glass-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-foreground">Nueva unidad</h3>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => { setCreating(false); setNewDraft(emptyUnitDraft) }}
            >
              Cancelar
            </button>
          </div>
          <UnitFormFields draft={newDraft} onChange={setNewDraft} />
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? 'Guardando…' : 'Crear unidad'}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="glass-card rounded-2xl overflow-hidden">
        {units.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            No hay unidades cargadas todavia.
          </div>
        ) : (
          <ul className="divide-y divide-border/30">
            {units.map((unit) => {
              const isExpanded = expandedUnitId === unit.id
              const activeHolders = unit.holders.filter((h) => h.isActive)
              const activeMemberships = unit.memberships.filter((m) => m.active)
              const isEditing = editingUnitId === unit.id
              const isAddingHolder = addingHolderFor === unit.id
              const isAddingUser = addingUserFor === unit.id

              return (
                <li key={unit.id} className={!unit.isActive ? 'opacity-60' : ''}>
                  <div
                    className="px-5 py-3 flex items-center gap-3 cursor-pointer hover:bg-muted/30"
                    onClick={() => setExpandedUnitId(isExpanded ? null : unit.id)}
                  >
                    <button type="button" className="text-muted-foreground">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-foreground">{unit.code}</span>
                        <span className="text-xs text-muted-foreground capitalize">{unit.kind}</span>
                        {!unit.isActive ? <span className="text-xs bg-muted px-1.5 py-0.5 rounded">inactiva</span> : null}
                        {activeMemberships.length > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800 border border-emerald-200">
                            <UserCheck className="w-2.5 h-2.5" />
                            {activeMemberships.length} usuario{activeMemberships.length === 1 ? '' : 's'}
                          </span>
                        ) : null}
                      </div>
                      {activeHolders.length > 0 ? (
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                          {activeHolders.map((h) => (
                            <span key={h.id} className="text-muted-foreground">
                              <span className="capitalize text-foreground/70">{h.holderKind}</span>
                              {': '}
                              <span className="text-foreground">{h.fullName}</span>
                              {h.email ? <span className="text-muted-foreground/70"> · {h.email}</span> : null}
                              {h.phone ? <span className="text-muted-foreground/70"> · {h.phone}</span> : null}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-0.5 text-xs text-muted-foreground italic">sin titulares activos</div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {unit.prorataCoefficient !== null ? `${(unit.prorataCoefficient * 100).toFixed(2)}%` : '—'}
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="px-5 py-4 bg-muted/20 space-y-4 border-t border-border/30">
                      <div className="flex items-center justify-between">
                        <div className="text-xs grid grid-cols-2 md:grid-cols-4 gap-3 flex-1">
                          <div><span className="text-muted-foreground">Piso:</span> {unit.floor ?? '—'}</div>
                          <div><span className="text-muted-foreground">Superficie:</span> {unit.surfaceM2 ? `${unit.surfaceM2} m²` : '—'}</div>
                          <div><span className="text-muted-foreground">Alicuota:</span> {unit.prorataCoefficient !== null ? `${(unit.prorataCoefficient * 100).toFixed(3)}%` : '—'}</div>
                          <div><span className="text-muted-foreground">Titulares:</span> {unit.holders.length}</div>
                        </div>
                        {canManageUnits && !isEditing ? (
                          <div className="flex gap-2 shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => { setEditingUnitId(unit.id); setEditDraft(unitToDraft(unit)) }}
                            >
                              <Pencil className="w-3.5 h-3.5 mr-1" />
                              Editar
                            </Button>
                            {unit.isActive ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={pending}
                                onClick={() => handleDeactivate(unit.id)}
                              >
                                Desactivar
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      {isEditing ? (
                        <form onSubmit={(e) => submitEditUnit(e, unit.id)} className="space-y-4 rounded-lg border border-border/40 p-4">
                          <UnitFormFields draft={editDraft} onChange={setEditDraft} />
                          <div className="flex justify-end gap-2">
                            <Button type="button" variant="ghost" size="sm" onClick={() => setEditingUnitId(null)}>
                              Cancelar
                            </Button>
                            <Button type="submit" size="sm" disabled={pending}>
                              Guardar
                            </Button>
                          </div>
                        </form>
                      ) : null}

                      {/* Holders */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium text-foreground">Titulares</h4>
                          {canManageHolders && !isAddingHolder ? (
                            <Button size="sm" variant="outline" onClick={() => setAddingHolderFor(unit.id)}>
                              <UserPlus className="w-3.5 h-3.5 mr-1" />
                              Agregar titular
                            </Button>
                          ) : null}
                        </div>

                        {unit.holders.length === 0 && !isAddingHolder ? (
                          <div className="text-xs text-muted-foreground italic">No hay titulares cargados.</div>
                        ) : (
                          <ul className="space-y-1.5">
                            {unit.holders.map((h) => (
                              <li key={h.id} className="text-xs rounded-md bg-background px-3 py-2 border border-border/40">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="font-medium text-foreground flex items-center gap-1.5 flex-wrap">
                                      <span>
                                        {h.fullName} <span className="text-muted-foreground capitalize font-normal">· {h.holderKind}</span>
                                      </span>
                                      {h.profileId ? (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800 border border-emerald-200">
                                          <UserCheck className="w-2.5 h-2.5" /> con usuario
                                        </span>
                                      ) : h.isActive ? (
                                        <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground border border-border/40">
                                          sin usuario
                                        </span>
                                      ) : null}
                                    </div>
                                    <div className="text-muted-foreground">
                                      {h.isActive ? (
                                        <>desde {h.startDate ?? '—'}</>
                                      ) : (
                                        <>del {h.startDate ?? '—'} al {h.endDate ?? '—'}</>
                                      )}
                                      {h.email ? ` · ${h.email}` : ''}
                                      {h.phone ? ` · ${h.phone}` : ''}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {h.isActive && canManageHolders && !h.profileId && h.email && accessDraft?.holderId !== h.id ? (
                                      <Button size="sm" variant="outline" disabled={pending} onClick={() => setAccessDraft({ holderId: h.id, isResponsableDePago: false })}>
                                        <UserPlus className="w-3.5 h-3.5 mr-1" />
                                        Crear acceso
                                      </Button>
                                    ) : null}
                                    {h.isActive && canManageHolders ? (
                                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => handleEndHolder(h.id)}>
                                        <UserX className="w-3.5 h-3.5 mr-1" />
                                        Finalizar
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>
                                {h.isActive && canManageHolders && !h.profileId && !h.email ? (
                                  <div className="mt-1.5 text-[11px] text-muted-foreground italic">
                                    Agregá un email a este contacto para poder crearle un usuario.
                                  </div>
                                ) : null}
                                {accessDraft?.holderId === h.id ? (
                                  <div className="mt-2 rounded-md border border-border/50 bg-muted/30 p-2 space-y-2">
                                    <p className="text-[11px] text-muted-foreground">
                                      Se creará un usuario para <b className="text-foreground">{h.email}</b> con una contraseña
                                      temporal enviada por mail. En el primer ingreso deberá cambiarla.
                                    </p>
                                    <label className="flex items-center gap-2 text-xs text-foreground">
                                      <input
                                        type="checkbox"
                                        checked={accessDraft.isResponsableDePago}
                                        onChange={(e) => setAccessDraft({ holderId: h.id, isResponsableDePago: e.target.checked })}
                                      />
                                      Responsable de pago (vecino principal de la unidad)
                                    </label>
                                    <div className="flex justify-end gap-2">
                                      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setAccessDraft(null)}>Cancelar</Button>
                                      <Button type="button" size="sm" disabled={pending} onClick={submitCreateAccess}>Crear acceso</Button>
                                    </div>
                                  </div>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}

                        {isAddingHolder ? (
                          <form onSubmit={(e) => submitHolder(e, unit.id)} className="mt-3 space-y-3 rounded-lg border border-border/40 p-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <Label>Nombre completo *</Label>
                                <Input
                                  value={holderDraft.fullName}
                                  onChange={(e) => setHolderDraft({ ...holderDraft, fullName: e.target.value })}
                                  required
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label>Relacion</Label>
                                <select
                                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                  value={holderDraft.holderKind}
                                  onChange={(e) => setHolderDraft({ ...holderDraft, holderKind: e.target.value as IAdminHolderKind })}
                                >
                                  {HOLDER_KIND_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1.5">
                                <Label>CUIT / DNI</Label>
                                <Input value={holderDraft.taxId} onChange={(e) => setHolderDraft({ ...holderDraft, taxId: e.target.value })} />
                              </div>
                              <div className="space-y-1.5">
                                <Label>Fecha inicio</Label>
                                <Input type="date" value={holderDraft.startDate} onChange={(e) => setHolderDraft({ ...holderDraft, startDate: e.target.value })} />
                              </div>
                              <div className="space-y-1.5">
                                <Label>Email</Label>
                                <Input type="email" value={holderDraft.email} onChange={(e) => setHolderDraft({ ...holderDraft, email: e.target.value })} />
                              </div>
                              <div className="space-y-1.5">
                                <Label>Telefono</Label>
                                <Input value={holderDraft.phone} onChange={(e) => setHolderDraft({ ...holderDraft, phone: e.target.value })} />
                              </div>
                            </div>
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={holderDraft.replaceActive}
                                onChange={(e) => setHolderDraft({ ...holderDraft, replaceActive: e.target.checked })}
                              />
                              Si ya hay un titular activo del mismo tipo, finalizarlo automaticamente
                            </label>
                            <div className="flex justify-end gap-2">
                              <Button type="button" size="sm" variant="ghost" onClick={resetHolderDraft}>Cancelar</Button>
                              <Button type="submit" size="sm" disabled={pending}>Agregar</Button>
                            </div>
                          </form>
                        ) : null}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <h4 className="text-sm font-medium text-foreground">Usuarios CITIFY de la unidad</h4>
                            <p className="text-xs text-muted-foreground">
                              Vincula propietario, vecino principal y hasta 4 familiares/convivientes.
                            </p>
                          </div>
                          {canManageHolders && !isAddingUser ? (
                            <Button size="sm" variant="outline" onClick={() => setAddingUserFor(unit.id)}>
                              <UserPlus className="w-3.5 h-3.5 mr-1" />
                              Agregar usuario
                            </Button>
                          ) : null}
                        </div>

                        {unit.memberships.length === 0 && !isAddingUser ? (
                          <div className="text-xs text-muted-foreground italic">No hay usuarios CITIFY vinculados.</div>
                        ) : (
                          <ul className="space-y-1.5">
                            {unit.memberships.map((membership) => (
                              <li key={membership.id} className="flex items-center justify-between text-xs rounded-md bg-background px-3 py-2 border border-border/40">
                                <div>
                                  <div className="font-medium text-foreground">
                                    {membership.profile?.fullName ?? 'Usuario'}
                                    <span className="text-muted-foreground capitalize font-normal">
                                      {' '}· {membership.relationshipType.replace('_', ' ')}
                                    </span>
                                    {membership.isPrimary ? (
                                      <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">principal</span>
                                    ) : null}
                                  </div>
                                  <div className="text-muted-foreground">
                                    {membership.profile?.email ?? 'sin email'}
                                    {membership.profile?.phone ? ` · ${membership.profile.phone}` : ''}
                                    {!membership.active ? ' · inactivo' : ''}
                                  </div>
                                </div>
                                {membership.active && canManageHolders ? (
                                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => handleDeactivateMembership(membership.id)}>
                                    <UserX className="w-3.5 h-3.5 mr-1" />
                                    Desvincular
                                  </Button>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}

                        {isAddingUser ? (
                          <div className="mt-3 space-y-4 rounded-lg border border-border/40 p-3">
                            <form onSubmit={(e) => submitLinkExisting(e, unit.id)} className="space-y-3">
                              <div className="text-sm font-medium">Vincular vecino existente</div>
                              <div className="space-y-1.5">
                                <Label>Buscar por nombre o email</Label>
                                <Input
                                  value={linkDraft.search}
                                  onChange={(e) => setLinkDraft({ ...linkDraft, search: e.target.value, profileId: '' })}
                                  placeholder="Tipear para filtrar..."
                                />
                                {(() => {
                                  const term = linkDraft.search.trim().toLowerCase()
                                  const filtered = linkableProfiles
                                    .filter((p) => {
                                      if (!term) return true
                                      return (
                                        p.fullName.toLowerCase().includes(term) ||
                                        p.email.toLowerCase().includes(term)
                                      )
                                    })
                                    .slice(0, 8)
                                  if (linkableProfiles.length === 0) {
                                    return (
                                      <p className="text-xs text-muted-foreground">
                                        No hay vecinos del consorcio disponibles. Crealos desde el panel superadmin o usá el form de abajo.
                                      </p>
                                    )
                                  }
                                  if (filtered.length === 0) {
                                    return <p className="text-xs text-muted-foreground">Sin resultados.</p>
                                  }
                                  return (
                                    <ul className="max-h-44 overflow-auto rounded-md border border-border/40 divide-y divide-border/40">
                                      {filtered.map((p) => {
                                        const selected = linkDraft.profileId === p.id
                                        const badge =
                                          p.activeMembershipsCount === 0
                                            ? 'sin unidad'
                                            : `${p.activeMembershipsCount} unidad${p.activeMembershipsCount === 1 ? '' : 'es'}`
                                        return (
                                          <li key={p.id}>
                                            <button
                                              type="button"
                                              onClick={() => setLinkDraft({ ...linkDraft, profileId: p.id })}
                                              className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/40 ${selected ? 'bg-muted/60' : ''}`}
                                            >
                                              <div className="font-medium">{p.fullName}</div>
                                              <div className="text-xs text-muted-foreground">
                                                {p.email} · {badge} · {p.role}
                                              </div>
                                            </button>
                                          </li>
                                        )
                                      })}
                                    </ul>
                                  )
                                })()}
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                  <Label>Tipo de vinculo</Label>
                                  <select
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={linkDraft.relationshipType}
                                    onChange={(e) =>
                                      setLinkDraft({
                                        ...linkDraft,
                                        relationshipType: e.target.value as typeof linkDraft.relationshipType,
                                      })
                                    }
                                  >
                                    {UNIT_USER_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              <div className="flex justify-end">
                                <Button type="submit" size="sm" disabled={pending || !linkDraft.profileId}>Vincular</Button>
                              </div>
                            </form>
                            <div className="relative">
                              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/40" /></div>
                              <div className="relative flex justify-center text-[10px] uppercase tracking-wider"><span className="bg-background px-2 text-muted-foreground">o crear nuevo</span></div>
                            </div>
                          <form onSubmit={(e) => submitUnitUser(e, unit.id)} className="space-y-3">
                            <p className="text-[11px] text-muted-foreground">
                              Crea el contacto y su usuario en un paso. Si ya cargaste el contacto, usá <b>Crear acceso</b> en la lista de titulares para no repetir datos.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <Label>Responsable de pago</Label>
                                <select
                                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                  value={userDraft.relationshipType}
                                  onChange={(e) => setUserDraft({ ...userDraft, relationshipType: e.target.value as typeof userDraft.relationshipType })}
                                >
                                  {UNIT_USER_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1.5">
                                <Label>Vínculo legal con la unidad</Label>
                                <select
                                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                  value={userDraft.holderKind}
                                  onChange={(e) => setUserDraft({ ...userDraft, holderKind: e.target.value as IAdminHolderKind })}
                                >
                                  {HOLDER_KIND_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1.5">
                                <Label>Nombre completo</Label>
                                <Input value={userDraft.fullName} onChange={(e) => setUserDraft({ ...userDraft, fullName: e.target.value })} required />
                              </div>
                              <div className="space-y-1.5">
                                <Label>Email</Label>
                                <Input type="email" value={userDraft.email} onChange={(e) => setUserDraft({ ...userDraft, email: e.target.value })} required />
                              </div>
                              <div className="space-y-1.5">
                                <Label>Telefono</Label>
                                <Input value={userDraft.phone} onChange={(e) => setUserDraft({ ...userDraft, phone: e.target.value })} />
                              </div>
                              <div className="space-y-1.5">
                                <Label>Password temporal</Label>
                                <Input value={userDraft.password} onChange={(e) => setUserDraft({ ...userDraft, password: e.target.value })} required />
                              </div>
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button type="button" size="sm" variant="ghost" onClick={resetUserDraft}>Cancelar</Button>
                              <Button type="submit" size="sm" disabled={pending}>Crear y vincular</Button>
                            </div>
                          </form>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
    <AlertDialog open={Boolean(confirmAction)} onOpenChange={(open) => (!open ? setConfirmAction(null) : undefined)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmCopy?.title ?? 'Confirmar accion'}</AlertDialogTitle>
          <AlertDialogDescription>{confirmCopy?.description ?? 'Esta accion no se puede deshacer facilmente.'}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmCurrentAction}>
            {confirmCopy?.actionLabel ?? 'Confirmar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}

function UnitFormFields({ draft, onChange }: { draft: UnitDraft; onChange: (next: UnitDraft) => void }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <div className="space-y-1.5">
        <Label>Codigo *</Label>
        <Input value={draft.code} onChange={(e) => onChange({ ...draft, code: e.target.value })} required />
      </div>
      <div className="space-y-1.5">
        <Label>Tipo</Label>
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={draft.kind}
          onChange={(e) => onChange({ ...draft, kind: e.target.value as IAdminUnitKind })}
        >
          {UNIT_KIND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>Piso</Label>
        <Input value={draft.floor} onChange={(e) => onChange({ ...draft, floor: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Superficie (m²)</Label>
        <Input inputMode="decimal" value={draft.surfaceM2} onChange={(e) => onChange({ ...draft, surfaceM2: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Alicuota (%)</Label>
        <Input
          inputMode="decimal"
          value={draft.prorataPct}
          onChange={(e) => onChange({ ...draft, prorataPct: e.target.value })}
          placeholder="12.50"
        />
      </div>
    </div>
  )
}
