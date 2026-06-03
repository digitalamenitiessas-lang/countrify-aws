'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ROLE_LABELS } from '@/lib/constants'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge, getRoleCreationCopy } from '@/components/superadmin/shared'
import {
  analyzeInitialOccupancyFile,
  confirmInitialOccupancyImport,
  createPlatformUser,
} from '@/app/superadmin/actions'
import type {
  InitialOccupancyImportPreview,
  InitialOccupancyImportRowDraft,
  InitialOccupancyImportRowStatus,
  InitialOccupancyUnitDecision,
  Profile,
  SuperAdminBuildingDetail,
  SuperAdminBusinessDetail,
  UnitProfileRelationship,
  UserRole,
} from '@/lib/types'

type ImportWizardStep = 'building' | 'upload' | 'review' | 'confirm'

const IMPORT_STEP_LABELS: Array<{ id: ImportWizardStep; label: string }> = [
  { id: 'building', label: 'Seleccionar country' },
  { id: 'upload', label: 'Subir archivo' },
  { id: 'review', label: 'Revisar propuesta IA' },
  { id: 'confirm', label: 'Confirmar importación' },
]

const IMPORT_RELATIONSHIP_OPTIONS: Array<{ value: UnitProfileRelationship; label: string }> = [
  { value: 'propietario', label: 'Propietario' },
  { value: 'vecino_principal', label: 'Vecino principal' },
  { value: 'vecino_adicional', label: 'Vecino adicional' },
]

function normalizeImportText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function recomputeImportPreview(preview: InitialOccupancyImportPreview): InitialOccupancyImportPreview {
  const groupedByUnit = new Map<string, InitialOccupancyImportRowDraft[]>()

  for (const row of preview.rows) {
    const key = normalizeImportText(row.unitCode)
    if (!key) continue
    const group = groupedByUnit.get(key) ?? []
    group.push(row)
    groupedByUnit.set(key, group)
  }

  const rows = preview.rows.map((row) => {
    const reasons: string[] = []
    const unitKey = normalizeImportText(row.unitCode)
    const unitRows = unitKey ? groupedByUnit.get(unitKey) ?? [] : []
    const principalCount = unitRows.filter((item) => item.relationshipType === 'vecino_principal').length
    const unitDecision: InitialOccupancyUnitDecision = row.unitCode.trim()
      ? row.existingUnitId
        ? 'reuse'
        : row.unitDecision === 'reuse'
          ? 'reuse'
          : 'create'
      : 'unresolved'

    if (!row.fullName.trim()) reasons.push('Falta nombre completo.')
    if (!row.email.trim()) reasons.push('Falta email.')
    if (!row.unitCode.trim()) reasons.push('La unidad requiere revisión.')
    if (row.relationshipType === 'vecino_principal' && principalCount > 1) {
      reasons.push('Hay más de un vecino principal propuesto para esta unidad.')
    }

    let status: InitialOccupancyImportRowStatus = reasons.length === 0 ? 'ready' : 'pending'
    if (!row.fullName.trim() && !row.email.trim() && !row.unitCode.trim()) {
      status = 'error'
    }

    return { ...row, status, statusReason: reasons[0] ?? null, unitDecision }
  })

  return {
    ...preview,
    rows,
    summary: {
      totalRows: rows.length,
      readyRows: rows.filter((row) => row.status === 'ready').length,
      pendingRows: rows.filter((row) => row.status === 'pending').length,
      errorRows: rows.filter((row) => row.status === 'error').length,
      unitsToCreate: rows.filter((row) => row.unitDecision === 'create').length,
      unitsToReuse: rows.filter((row) => row.unitDecision === 'reuse').length,
      usersToCreateEstimate: rows.filter((row) => row.status === 'ready').length,
      membershipsToUpsert: rows.filter((row) => row.status === 'ready').length,
    },
  }
}

export function UsuariosView({
  users,
  buildings,
  businesses,
}: {
  users: Profile[]
  buildings: SuperAdminBuildingDetail[]
  businesses: SuperAdminBusinessDetail[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [importPending, startImportTransition] = useTransition()
  const [userDraft, setUserDraft] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: 'Countrify2026!',
    role: 'vecino',
    buildingId: '',
    businessId: '',
  })
  const [importStep, setImportStep] = useState<ImportWizardStep>('building')
  const [selectedImportBuildingId, setSelectedImportBuildingId] = useState('')
  const [importFile, setImportFile] = useState<{ fileName: string; mimeType: string; fileBase64: string } | null>(null)
  const [importPreview, setImportPreview] = useState<InitialOccupancyImportPreview | null>(null)

  const isConsorcioAdminDraft = userDraft.role === 'consorcio_admin'
  const needsDirectBuilding = userDraft.role === 'vecino' || userDraft.role === 'propietario'
  const needsBusiness = userDraft.role === 'negocio_admin'
  const roleCreationCopy = getRoleCreationCopy(userDraft.role)
  const selectedImportBuilding = buildings.find((building) => building.id === selectedImportBuildingId) ?? null

  function updateUserRole(nextRole: string) {
    setUserDraft((current) => ({
      ...current,
      role: nextRole,
      buildingId: nextRole === 'vecino' || nextRole === 'propietario' ? current.buildingId : '',
      businessId: nextRole === 'negocio_admin' ? current.businessId : '',
    }))
  }

  function resetImportFlow() {
    setImportStep('building')
    setSelectedImportBuildingId('')
    setImportFile(null)
    setImportPreview(null)
  }

  async function handleImportFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      setImportFile(null)
      return
    }

    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!extension || !['xlsx', 'xls', 'csv'].includes(extension)) {
      toast.error('Solo se admiten archivos .xlsx, .xls o .csv.')
      event.target.value = ''
      return
    }

    const reader = new FileReader()
    const result = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })

    const base64 = result.split(',')[1] ?? ''
    setImportFile({
      fileName: file.name,
      mimeType:
        file.type ||
        (extension === 'csv'
          ? 'text/csv'
          : extension === 'xls'
            ? 'application/vnd.ms-excel'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
      fileBase64: base64,
    })
    setImportPreview(null)
  }

  function updateImportPreviewRow(rowId: string, patch: Partial<InitialOccupancyImportRowDraft>) {
    setImportPreview((current) => {
      if (!current) return current
      const next = { ...current, rows: current.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)) }
      return recomputeImportPreview(next)
    })
  }

  function analyzeImportFile() {
    if (!selectedImportBuildingId) {
      toast.error('Selecciona primero el country destino.')
      return
    }
    if (!importFile) {
      toast.error('Sube primero el archivo a procesar.')
      return
    }

    startImportTransition(async () => {
      try {
        const preview = await analyzeInitialOccupancyFile({
          buildingId: selectedImportBuildingId,
          fileName: importFile.fileName,
          mimeType: importFile.mimeType,
          fileBase64: importFile.fileBase64,
        })
        setImportPreview(recomputeImportPreview(preview))
        setImportStep('review')
        toast.success('La planilla fue interpretada. Revisa la propuesta antes de importar.')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No pudimos analizar el archivo.')
      }
    })
  }

  function confirmImportPreview() {
    if (!importPreview) {
      toast.error('Primero debes analizar una planilla.')
      return
    }

    startImportTransition(async () => {
      try {
        const result = await confirmInitialOccupancyImport({
          buildingId: importPreview.buildingId,
          rows: importPreview.rows,
        })

        if (result.errors.length > 0) {
          toast(`Importación parcial: ${result.linkedMemberships} vínculos listos, ${result.errors.length} filas con error.`)
          console.warn('Errores importación IA', result.errors)
        } else {
          toast.success(
            `Importación lista: ${result.createdUsers} usuarios, ${result.createdUnits} unidades y ${result.linkedMemberships + result.updatedMemberships} vínculos procesados.`,
          )
        }

        resetImportFlow()
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No pudimos confirmar la importación.')
      }
    })
  }

  function submitUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(async () => {
      try {
        await createPlatformUser({
          fullName: userDraft.fullName,
          email: userDraft.email,
          phone: userDraft.phone || null,
          password: userDraft.password,
          role: userDraft.role as UserRole,
          buildingId: needsDirectBuilding ? userDraft.buildingId || null : null,
          businessId: needsBusiness ? userDraft.businessId || null : null,
        })
        toast.success(
          userDraft.role === 'consorcio_admin'
            ? 'Admin consorcio creado. Puedes asignarle countries desde el alta de consorcio.'
            : 'Usuario creado',
        )
        setUserDraft({ fullName: '', email: '', phone: '', password: 'Countrify2026!', role: 'vecino', buildingId: '', businessId: '' })
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-bold text-foreground text-lg leading-tight">Usuarios</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{users.length} cuentas registradas</p>
      </div>

      <form onSubmit={submitUser} className="glass-card rounded-xl p-5 mb-5">
        <div className="mb-4">
          <h3 className="font-semibold text-foreground text-sm">Crear usuario manual</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Crea la cuenta base y despues completa sus vinculos operativos segun el rol. Para residentes y propietarios, la
            asociacion fina a la unidad se termina desde IAdmin.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" placeholder="Nombre completo" value={userDraft.fullName} onChange={(e) => setUserDraft({ ...userDraft, fullName: e.target.value })} required />
          <input className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" placeholder="Email" type="email" value={userDraft.email} onChange={(e) => setUserDraft({ ...userDraft, email: e.target.value })} required />
          <input className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" placeholder="Telefono" value={userDraft.phone} onChange={(e) => setUserDraft({ ...userDraft, phone: e.target.value })} />
          <select className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" value={userDraft.role} onChange={(e) => updateUserRole(e.target.value)}>
            <option value="vecino">Vecino</option>
            <option value="propietario">Propietario</option>
            <option value="consorcio_admin">Admin consorcio</option>
            <option value="negocio_admin">Admin negocio</option>
            <option value="super_admin">Super admin</option>
          </select>
          {needsDirectBuilding && (
            <select className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" value={userDraft.buildingId} onChange={(e) => setUserDraft({ ...userDraft, buildingId: e.target.value })}>
              <option value="">Sin country directo</option>
              {buildings.map((building) => (
                <option key={building.id} value={building.id}>{building.name}</option>
              ))}
            </select>
          )}
          {needsBusiness && (
            <select className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" value={userDraft.businessId} onChange={(e) => setUserDraft({ ...userDraft, businessId: e.target.value })}>
              <option value="">Seleccionar negocio</option>
              {businesses.map((business) => (
                <option key={business.id} value={business.id}>{business.name}</option>
              ))}
            </select>
          )}
          <input className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm" placeholder="Password temporal" value={userDraft.password} onChange={(e) => setUserDraft({ ...userDraft, password: e.target.value })} required />
        </div>
        <div className="mt-4 rounded-xl border border-border/40 bg-background/60 p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-primary">{roleCreationCopy.title}</div>
          <p className="mt-1 text-sm text-muted-foreground">{roleCreationCopy.body}</p>
          {isConsorcioAdminDraft && (
            <p className="mt-2 text-xs text-muted-foreground">
              Esta vista ya no te pide un country unico para el admin. La asignacion de cada consorcio se hace despues
              desde la creacion del country.
            </p>
          )}
        </div>
        <div className="mt-4 flex justify-end">
          <button type="submit" disabled={pending} className="rounded-lg px-4 py-2 text-sm font-semibold text-white btn-premium">
            {pending ? 'Creando...' : 'Crear usuario'}
          </button>
        </div>
      </form>

      <div className="glass-card rounded-xl p-5 mb-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="font-semibold text-foreground text-sm">Importación asistida con IA</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sube un Excel o CSV de un solo country. Countrify interpretará la planilla, propondrá unidades y relaciones,
              y te dejará revisar todo antes de importar.
            </p>
          </div>
          <button
            type="button"
            onClick={resetImportFlow}
            className="rounded-lg border border-border/50 px-3 py-2 text-xs font-semibold text-muted-foreground"
          >
            Reiniciar flujo
          </button>
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          {IMPORT_STEP_LABELS.map((step, index) => {
            const activeIndex = IMPORT_STEP_LABELS.findIndex((item) => item.id === importStep)
            const isActive = step.id === importStep
            const isCompleted = index < activeIndex
            return (
              <div
                key={step.id}
                className={`rounded-xl border px-3 py-3 ${
                  isActive ? 'border-primary/40 bg-primary/10' : isCompleted ? 'border-border/60 bg-background/80' : 'border-border/40 bg-background/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                  {isCompleted && <Badge color="success">Listo</Badge>}
                </div>
                <div className="mt-2 text-sm font-semibold text-foreground">{step.label}</div>
              </div>
            )
          })}
        </div>

        <div className="mt-5 rounded-2xl border border-border/40 bg-background/70 p-4">
          {importStep === 'building' && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Seleccionar country</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Esta importación procesa un solo consorcio por archivo. Elige primero el country destino.
                </p>
              </div>
              <select
                className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm"
                value={selectedImportBuildingId}
                onChange={(e) => setSelectedImportBuildingId(e.target.value)}
              >
                <option value="">Seleccionar consorcio</option>
                {buildings.map((building) => (
                  <option key={building.id} value={building.id}>{building.name}</option>
                ))}
              </select>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedImportBuildingId) {
                      toast.error('Selecciona un country para continuar.')
                      return
                    }
                    setImportStep('upload')
                  }}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white btn-premium"
                >
                  Continuar
                </button>
              </div>
            </div>
          )}

          {importStep === 'upload' && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subir archivo</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Country seleccionado: <span className="font-medium text-foreground">{selectedImportBuilding?.name ?? 'Sin country'}</span>
                </p>
              </div>
              <div className="rounded-xl border border-dashed border-border/60 bg-background/60 p-4">
                <Label htmlFor="initial-occupancy-file">Archivo Excel o CSV</Label>
                <input
                  id="initial-occupancy-file"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleImportFileChange}
                  className="mt-2 block w-full text-sm text-muted-foreground"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Soporta `.xlsx`, `.xls` y `.csv`. La IA usará el archivo para detectar columnas y proponer la asignación a unidades.
                </p>
                {importFile && (
                  <p className="mt-3 text-xs text-foreground">
                    Archivo listo: <span className="font-medium">{importFile.fileName}</span>
                  </p>
                )}
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <button type="button" onClick={() => setImportStep('building')} className="rounded-lg border border-border/50 px-4 py-2 text-sm font-semibold text-foreground">
                  Volver
                </button>
                <button
                  type="button"
                  onClick={analyzeImportFile}
                  disabled={importPending || !selectedImportBuildingId || !importFile}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white btn-premium disabled:opacity-60"
                >
                  {importPending ? 'Analizando...' : 'Analizar con IA'}
                </button>
              </div>
            </div>
          )}

          {importStep === 'review' && importPreview && (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Revisar propuesta IA</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Corrige filas pendientes antes de confirmar. Las filas listas se podrán importar tal como están.
                  </p>
                </div>
                <Badge color="default">{importPreview.fileName}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                <div className="rounded-xl border border-border/40 bg-background/60 p-3">
                  <div className="text-xs text-muted-foreground">Filas</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">{importPreview.summary.totalRows}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-background/60 p-3">
                  <div className="text-xs text-muted-foreground">Listas</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">{importPreview.summary.readyRows}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-background/60 p-3">
                  <div className="text-xs text-muted-foreground">Pendientes</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">{importPreview.summary.pendingRows}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-background/60 p-3">
                  <div className="text-xs text-muted-foreground">Unidades nuevas</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">{importPreview.summary.unitsToCreate}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-background/60 p-3">
                  <div className="text-xs text-muted-foreground">Reutiliza unidades</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">{importPreview.summary.unitsToReuse}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-background/60 p-3">
                  <div className="text-xs text-muted-foreground">Vínculos</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">{importPreview.summary.membershipsToUpsert}</div>
                </div>
              </div>

              {importPreview.warnings.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-800">
                  <p className="font-semibold uppercase tracking-wider">Advertencias detectadas</p>
                  <ul className="mt-2 space-y-1">
                    {importPreview.warnings.map((warning, index) => (
                      <li key={`${warning}-${index}`}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-border/40">
                <table className="min-w-full text-sm">
                  <thead className="bg-background/80">
                    <tr className="border-b border-border/50">
                      {['Estado', 'Persona', 'Contacto', 'Unidad', 'Piso', 'Relación', 'Unidad destino', 'Motivo'].map((header) => (
                        <th key={header} className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.rows.map((row) => (
                      <tr key={row.id} className="border-b border-border/30 align-top last:border-0">
                        <td className="px-3 py-3">
                          <Badge color={row.status === 'ready' ? 'success' : row.status === 'pending' ? 'warn' : 'default'}>
                            {row.status === 'ready' ? 'Lista' : row.status === 'pending' ? 'Pendiente' : 'Error'}
                          </Badge>
                          <p className="mt-2 text-[11px] text-muted-foreground">{row.sourceSheet} · línea {row.sourceRowNumber}</p>
                        </td>
                        <td className="px-3 py-3">
                          <Input value={row.fullName} onChange={(event) => updateImportPreviewRow(row.id, { fullName: event.target.value })} className="min-w-[220px]" />
                          <p className="mt-2 text-[11px] text-muted-foreground">{row.rawPreview || 'Sin vista previa original'}</p>
                        </td>
                        <td className="px-3 py-3 space-y-2">
                          <Input value={row.email} onChange={(event) => updateImportPreviewRow(row.id, { email: event.target.value })} placeholder="Email" className="min-w-[220px]" />
                          <Input value={row.phone} onChange={(event) => updateImportPreviewRow(row.id, { phone: event.target.value })} placeholder="Teléfono" className="min-w-[220px]" />
                        </td>
                        <td className="px-3 py-3">
                          <Input
                            value={row.unitCode}
                            onChange={(event) => updateImportPreviewRow(row.id, { unitCode: event.target.value, existingUnitId: null, unitDecision: 'create' })}
                            placeholder="Unidad"
                            className="min-w-[140px]"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <Input value={row.floor ?? ''} onChange={(event) => updateImportPreviewRow(row.id, { floor: event.target.value })} placeholder="Piso" className="min-w-[90px]" />
                        </td>
                        <td className="px-3 py-3">
                          <select
                            className="min-w-[180px] rounded-lg border border-border/50 bg-background px-3 py-2 text-sm"
                            value={row.relationshipType}
                            onChange={(event) => updateImportPreviewRow(row.id, { relationshipType: event.target.value as UnitProfileRelationship })}
                          >
                            {IMPORT_RELATIONSHIP_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-3">
                          <select
                            className="min-w-[150px] rounded-lg border border-border/50 bg-background px-3 py-2 text-sm"
                            value={row.unitDecision}
                            onChange={(event) =>
                              updateImportPreviewRow(row.id, {
                                unitDecision: event.target.value as InitialOccupancyImportRowDraft['unitDecision'],
                                existingUnitId: event.target.value === 'reuse' ? row.existingUnitId : null,
                              })
                            }
                          >
                            <option value="reuse">Reutilizar</option>
                            <option value="create">Crear unidad</option>
                            <option value="unresolved">Pendiente</option>
                          </select>
                        </td>
                        <td className="px-3 py-3">
                          <p className="text-xs text-muted-foreground">{row.statusReason ?? 'Sin observaciones'}</p>
                          <p className="mt-2 text-[11px] text-muted-foreground">Confianza IA: {row.confidence}%</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap justify-between gap-2">
                <button type="button" onClick={() => setImportStep('upload')} className="rounded-lg border border-border/50 px-4 py-2 text-sm font-semibold text-foreground">
                  Volver
                </button>
                <button type="button" onClick={() => setImportStep('confirm')} className="rounded-lg px-4 py-2 text-sm font-semibold text-white btn-premium">
                  Ir a confirmación
                </button>
              </div>
            </div>
          )}

          {importStep === 'confirm' && importPreview && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Confirmar importación</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Se importarán únicamente las filas listas. Las pendientes quedarán fuera hasta que vuelvas a revisarlas.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-border/40 bg-background/60 p-4">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Country destino</div>
                  <div className="mt-2 text-sm font-semibold text-foreground">{importPreview.buildingName}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{importPreview.fileName}</p>
                </div>
                <div className="rounded-xl border border-border/40 bg-background/60 p-4">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Resultado esperado</div>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {importPreview.summary.readyRows} filas listas · {importPreview.summary.pendingRows} pendientes
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {importPreview.summary.unitsToCreate} unidades nuevas · {importPreview.summary.membershipsToUpsert} vínculos a procesar
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap justify-between gap-2">
                <button type="button" onClick={() => setImportStep('review')} className="rounded-lg border border-border/50 px-4 py-2 text-sm font-semibold text-foreground">
                  Volver a revisar
                </button>
                <button
                  type="button"
                  onClick={confirmImportPreview}
                  disabled={importPending || importPreview.summary.readyRows === 0}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white btn-premium disabled:opacity-60"
                >
                  {importPending ? 'Importando...' : 'Confirmar importación'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50" style={{ background: 'rgba(0,0,0,0.03)' }}>
                {['Usuario', 'Email', 'Rol', 'Teléfono'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs text-muted-foreground font-medium uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-border/30 last:border-0 hover:bg-secondary/30">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #112250, #0a1838)' }}
                      >
                        {user.avatarText}
                      </div>
                      <span className="font-medium text-foreground">{user.fullName}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">{user.email}</td>
                  <td className="px-5 py-3.5">
                    <Badge color={user.role === 'super_admin' ? 'primary' : 'default'}>{ROLE_LABELS[user.role]}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">{user.phone ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
