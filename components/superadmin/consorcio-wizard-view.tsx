'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import DynamicMap from '@/components/map/map-view-dynamic'
import { createManagedProperty, createPlatformUser } from '@/app/superadmin/actions'
import {
  Badge,
  ConsorcioCreatedScreen,
  PROPERTY_KIND_OPTIONS,
  describeAdminAssignment,
  type CreatedConsorcio,
} from '@/components/superadmin/shared'
import type { IAdminPropertyKind, SuperAdminConsorcioAdminOption } from '@/lib/types'

type ConsorcioWizardStepId = 'consorcio' | 'admin' | 'summary'

const CONSORCIO_WIZARD_STEPS: Array<{
  id: ConsorcioWizardStepId
  label: string
  description: string
}> = [
  { id: 'consorcio', label: 'El consorcio', description: 'Nombre, tipo y ubicación del consorcio o country.' },
  { id: 'admin', label: 'Administrador', description: 'La cuenta que va a operar el consorcio.' },
  { id: 'summary', label: 'Resumen', description: 'Verificación final antes de crear.' },
]

export function ConsorcioWizardView({ consorcioAdmins }: { consorcioAdmins: SuperAdminConsorcioAdminOption[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [consorcioDraft, setConsorcioDraft] = useState({
    buildingName: '',
    buildingAddress: '',
    buildingLocality: 'San Miguel de Tucumán',
    totalUnits: '',
    latitude: '',
    longitude: '',
    administrationName: '',
    administrationLegalName: '',
    administrationTaxId: '',
    administrationContactEmail: '',
    administrationContactPhone: '',
    displayName: '',
    propertyKind: 'consorcio' as IAdminPropertyKind,
    propertyTaxId: '',
    managedSince: '',
    managementFeePct: '',
    notes: '',
    adminProfileId: '',
    adminMode: (consorcioAdmins.length === 0 ? 'new' : 'existing') as 'existing' | 'new',
    newAdminFullName: '',
    newAdminEmail: '',
    newAdminPassword: 'Countrify2026!',
  })
  const [consorcioStepIndex, setConsorcioStepIndex] = useState(0)
  const [createdConsorcio, setCreatedConsorcio] = useState<CreatedConsorcio | null>(null)
  const [administrationNameTouched, setAdministrationNameTouched] = useState(false)
  const [showOptional, setShowOptional] = useState(false)
  const [consorcioLocationSearching, setConsorcioLocationSearching] = useState(false)
  const [mapRecenterKey, setMapRecenterKey] = useState(0)
  const mapCardRef = useRef<HTMLDivElement>(null)

  const currentConsorcioStep = CONSORCIO_WIZARD_STEPS[consorcioStepIndex]
  const selectedConsorcioAdmin =
    consorcioAdmins.find((admin) => admin.profileId === consorcioDraft.adminProfileId) ?? null
  const consorcioMapLocation =
    consorcioDraft.latitude && consorcioDraft.longitude
      ? ([Number(consorcioDraft.latitude.replace(',', '.')), Number(consorcioDraft.longitude.replace(',', '.'))] as [number, number])
      : null
  const administrationSummaryName = consorcioDraft.administrationName.trim() || consorcioDraft.buildingName.trim()
  const hasAdministrationCustomData =
    administrationNameTouched ||
    Boolean(
      consorcioDraft.administrationLegalName.trim() ||
        consorcioDraft.administrationTaxId.trim() ||
        consorcioDraft.administrationContactEmail.trim() ||
        consorcioDraft.administrationContactPhone.trim(),
    )

  function resetConsorcioDraft() {
    setConsorcioDraft({
      buildingName: '',
      buildingAddress: '',
      buildingLocality: 'San Miguel de Tucumán',
      totalUnits: '',
      latitude: '',
      longitude: '',
      administrationName: '',
      administrationLegalName: '',
      administrationTaxId: '',
      administrationContactEmail: '',
      administrationContactPhone: '',
      displayName: '',
      propertyKind: 'consorcio',
      propertyTaxId: '',
      managedSince: '',
      managementFeePct: '',
      notes: '',
      adminProfileId: '',
      adminMode: consorcioAdmins.length === 0 ? 'new' : 'existing',
      newAdminFullName: '',
      newAdminEmail: '',
      newAdminPassword: 'Countrify2026!',
    })
    setAdministrationNameTouched(false)
    setShowOptional(false)
    setConsorcioStepIndex(0)
  }

  function updateBuildingName(value: string) {
    setConsorcioDraft((current) => ({
      ...current,
      buildingName: value,
      administrationName: administrationNameTouched ? current.administrationName : value,
    }))
  }

  async function locateConsorcioAddress() {
    if (!consorcioDraft.buildingAddress.trim()) {
      toast.error('Ingresa una direccion antes de ubicar el country.')
      return
    }

    setConsorcioLocationSearching(true)
    toast.loading('Buscando direccion...', { id: 'consorcio-geocode' })

    try {
      const locality = consorcioDraft.buildingLocality.trim() || 'Tucumán'
      const query = encodeURIComponent(`${consorcioDraft.buildingAddress}, ${locality}, Argentina`)
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`)
      const data = await response.json()

      if (Array.isArray(data) && data.length > 0) {
        setConsorcioDraft((current) => ({
          ...current,
          latitude: String(parseFloat(data[0].lat)),
          longitude: String(parseFloat(data[0].lon)),
        }))
        setMapRecenterKey((key) => key + 1)
        requestAnimationFrame(() => {
          mapCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        })
        toast.success('Ubicacion aproximada encontrada.', { id: 'consorcio-geocode' })
      } else {
        toast.error('No pudimos ubicarla. Puedes marcar el punto manualmente en el mapa.', { id: 'consorcio-geocode' })
      }
    } catch {
      toast.error('Error buscando la direccion.', { id: 'consorcio-geocode' })
    } finally {
      setConsorcioLocationSearching(false)
    }
  }

  async function reverseGeocodeToAddress(lat: number, lng: number) {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      )
      const data = await response.json()
      const address = data?.address
      if (!address) return

      const street = [address.road, address.house_number].filter(Boolean).join(' ')
      const locality =
        address.suburb || address.neighbourhood || address.city || address.town || address.village || address.county

      setConsorcioDraft((current) => ({
        ...current,
        buildingAddress: street || current.buildingAddress,
        buildingLocality: locality || current.buildingLocality,
      }))

      if (street) {
        toast.success('Dirección actualizada desde el punto del mapa.', { id: 'consorcio-reverse-geocode' })
      }
    } catch {
      // Silencioso: si el reverse falla, dejamos las coordenadas igual.
    }
  }

  function getConsorcioStepError(stepIndex = consorcioStepIndex) {
    const step = CONSORCIO_WIZARD_STEPS[stepIndex]

    if (step.id === 'consorcio') {
      if (!consorcioDraft.buildingName.trim()) return 'Completa el nombre del consorcio.'
      if (!consorcioDraft.propertyKind) return 'Selecciona el tipo de consorcio.'
      if (!consorcioDraft.buildingAddress.trim()) return 'Completa la direccion del consorcio.'
      if (!consorcioDraft.totalUnits.trim()) return 'Indica la cantidad total de unidades.'

      const totalUnits = Number(consorcioDraft.totalUnits)
      if (!Number.isFinite(totalUnits) || totalUnits < 0) return 'La cantidad total de unidades es invalida.'

      if (consorcioDraft.latitude && !Number.isFinite(Number(consorcioDraft.latitude.replace(',', '.')))) {
        return 'La latitud es invalida.'
      }
      if (consorcioDraft.longitude && !Number.isFinite(Number(consorcioDraft.longitude.replace(',', '.')))) {
        return 'La longitud es invalida.'
      }
    }

    if (step.id === 'admin') {
      if (consorcioDraft.adminMode === 'new') {
        if (consorcioDraft.newAdminFullName.trim().length < 2) return 'Ingresa el nombre del administrador.'
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(consorcioDraft.newAdminEmail.trim())) return 'Ingresa un email válido para el administrador.'
        if (consorcioDraft.newAdminPassword.length < 8) return 'La contraseña del administrador debe tener al menos 8 caracteres.'
      } else {
        if (consorcioAdmins.length === 0) return 'No hay admins existentes. Crea uno nuevo desde acá o en la sección Usuarios.'
        if (!consorcioDraft.adminProfileId) return 'Selecciona el administrador inicial.'
      }

      if (consorcioDraft.managementFeePct) {
        const fee = Number(consorcioDraft.managementFeePct.replace(',', '.'))
        if (!Number.isFinite(fee) || fee < 0 || fee > 100) {
          return 'El fee de administracion debe estar entre 0 y 100.'
        }
      }
    }

    return null
  }

  function goToConsorcioStep(targetIndex: number) {
    if (targetIndex <= consorcioStepIndex) {
      setConsorcioStepIndex(targetIndex)
      return
    }
    for (let index = 0; index < targetIndex; index += 1) {
      const error = getConsorcioStepError(index)
      if (error) {
        toast.error(error)
        setConsorcioStepIndex(index)
        return
      }
    }
    setConsorcioStepIndex(targetIndex)
  }

  function nextConsorcioStep() {
    const error = getConsorcioStepError()
    if (error) {
      toast.error(error)
      return
    }
    setConsorcioStepIndex((current) => Math.min(current + 1, CONSORCIO_WIZARD_STEPS.length - 1))
  }

  function previousConsorcioStep() {
    setConsorcioStepIndex((current) => Math.max(current - 1, 0))
  }

  function submitConsorcio(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (currentConsorcioStep.id !== 'summary') {
      nextConsorcioStep()
      return
    }

    startTransition(async () => {
      try {
        const totalUnits = Number(consorcioDraft.totalUnits)
        const latitude = consorcioDraft.latitude ? Number(consorcioDraft.latitude.replace(',', '.')) : null
        const longitude = consorcioDraft.longitude ? Number(consorcioDraft.longitude.replace(',', '.')) : null
        const managementFeePct = consorcioDraft.managementFeePct
          ? Number(consorcioDraft.managementFeePct.replace(',', '.'))
          : null

        if (!Number.isFinite(totalUnits) || totalUnits < 0) throw new Error('La cantidad total de unidades es invalida.')
        if (latitude !== null && !Number.isFinite(latitude)) throw new Error('La latitud es invalida.')
        if (longitude !== null && !Number.isFinite(longitude)) throw new Error('La longitud es invalida.')
        if (managementFeePct !== null && (!Number.isFinite(managementFeePct) || managementFeePct < 0 || managementFeePct > 100)) {
          throw new Error('El fee de administracion debe estar entre 0 y 100.')
        }

        let adminProfileId = consorcioDraft.adminProfileId
        if (consorcioDraft.adminMode === 'new') {
          const created = await createPlatformUser({
            fullName: consorcioDraft.newAdminFullName.trim(),
            email: consorcioDraft.newAdminEmail.trim().toLowerCase(),
            password: consorcioDraft.newAdminPassword,
            role: 'consorcio_admin',
          })
          adminProfileId = created.profileId
        }

        const result = await createManagedProperty({
          building: {
            name: consorcioDraft.buildingName,
            address: consorcioDraft.buildingLocality.trim()
              ? `${consorcioDraft.buildingAddress.trim()}, ${consorcioDraft.buildingLocality.trim()}`
              : consorcioDraft.buildingAddress,
            totalUnits,
            latitude,
            longitude,
          },
          administration: {
            name: consorcioDraft.administrationName.trim() || consorcioDraft.buildingName,
            legalName: consorcioDraft.administrationLegalName.trim() || null,
            taxId: consorcioDraft.administrationTaxId.trim() || null,
            contactEmail: consorcioDraft.administrationContactEmail.trim() || null,
            contactPhone: consorcioDraft.administrationContactPhone.trim() || null,
          },
          managedProperty: {
            displayName: consorcioDraft.displayName || null,
            propertyKind: consorcioDraft.propertyKind,
            taxId: consorcioDraft.propertyTaxId || null,
            managedSince: consorcioDraft.managedSince || null,
            managementFeePct,
            notes: consorcioDraft.notes || null,
          },
          adminProfileId,
        })

        const adminInfo =
          consorcioDraft.adminMode === 'new'
            ? {
                fullName: consorcioDraft.newAdminFullName.trim(),
                email: consorcioDraft.newAdminEmail.trim().toLowerCase(),
                password: consorcioDraft.newAdminPassword,
                isNew: true,
              }
            : {
                fullName: selectedConsorcioAdmin?.fullName ?? '',
                email: selectedConsorcioAdmin?.email ?? '',
                password: null,
                isNew: false,
              }

        toast.success('Consorcio creado. Ahora cargá el padrón de unidades.')
        setCreatedConsorcio({
          buildingId: result.buildingId,
          administrationId: result.administrationId,
          managedPropertyId: result.managedPropertyId,
          name: consorcioDraft.displayName.trim() || consorcioDraft.buildingName.trim() || 'Consorcio',
          admin: adminInfo,
        })
        resetConsorcioDraft()
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error')
      }
    })
  }

  if (createdConsorcio) {
    return (
      <ConsorcioCreatedScreen
        created={createdConsorcio}
        onGoToBuilding={() => router.push(`/superadmin/consorcios/${createdConsorcio.buildingId}`)}
        onCreateAnother={() => setCreatedConsorcio(null)}
      />
    )
  }

  return (
    <form onSubmit={submitConsorcio} className="glass-card rounded-xl p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-primary">Wizard de alta</div>
          <h3 className="mt-1 text-sm font-semibold text-foreground">Nuevo consorcio / country</h3>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            Cargá los datos del consorcio y la cuenta del administrador. Lo opcional (facturación, fee, etc.) podés
            dejarlo para después: se autocompleta y lo editás desde el detalle.
          </p>
        </div>
        <div className="rounded-full border border-border/40 bg-background/70 px-3 py-1 text-xs text-muted-foreground">
          Paso {consorcioStepIndex + 1} de {CONSORCIO_WIZARD_STEPS.length}
        </div>
      </div>

      <div className="mt-5 grid gap-2 md:grid-cols-3">
        {CONSORCIO_WIZARD_STEPS.map((step, index) => {
          const isActive = index === consorcioStepIndex
          const isCompleted = index < consorcioStepIndex
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => goToConsorcioStep(index)}
              className={`rounded-xl border px-3 py-3 text-left transition-all ${
                isActive
                  ? 'border-primary/40 bg-primary/10'
                  : isCompleted
                    ? 'border-border/60 bg-background/80'
                    : 'border-border/40 bg-background/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {String(index + 1).padStart(2, '0')}
                </span>
                {isCompleted && <Badge color="success">Listo</Badge>}
              </div>
              <div className="mt-2 text-sm font-semibold text-foreground">{step.label}</div>
              <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
            </button>
          )
        })}
      </div>

      <div className="mt-5 space-y-5 rounded-2xl border border-border/40 bg-background/70 p-4">
        <div className="mb-1">
          <p className="text-xs font-medium uppercase tracking-wider text-primary">{currentConsorcioStep.label}</p>
          <p className="mt-1 text-sm text-muted-foreground">{currentConsorcioStep.description}</p>
        </div>

        {currentConsorcioStep.id === 'consorcio' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Nombre del consorcio / country</Label>
                <Input
                  placeholder="Ej. Country Las Marías"
                  value={consorcioDraft.buildingName}
                  onChange={(e) => updateBuildingName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Tipo</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-border/50 bg-background px-3 py-1 text-sm"
                  value={consorcioDraft.propertyKind}
                  onChange={(e) => setConsorcioDraft({ ...consorcioDraft, propertyKind: e.target.value as IAdminPropertyKind })}
                >
                  {PROPERTY_KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Capacidad estimada (informativa)</Label>
                <Input
                  placeholder="Ej. 120"
                  inputMode="numeric"
                  value={consorcioDraft.totalUnits}
                  onChange={(e) => setConsorcioDraft({ ...consorcioDraft, totalUnits: e.target.value })}
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  Dato informativo. Las unidades reales las carga el administrador desde IAdmin o importando un Excel.
                </p>
              </div>
              <div className="space-y-1">
                <Label>Nombre a mostrar (opcional)</Label>
                <Input
                  placeholder="Si lo dejás vacío, usa el nombre del consorcio"
                  value={consorcioDraft.displayName}
                  onChange={(e) => setConsorcioDraft({ ...consorcioDraft, displayName: e.target.value })}
                />
              </div>
            </div>

            <div ref={mapCardRef} className="glass-card rounded-2xl p-4 overflow-hidden relative scroll-mt-24">
              <div className="flex flex-col gap-6 lg:flex-row">
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    Ubicacion del consorcio
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Busca la direccion y, si hace falta, corrige manualmente el punto haciendo click en el mapa.
                  </p>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Localidad</Label>
                      <Input
                        value={consorcioDraft.buildingLocality}
                        onChange={(event) => setConsorcioDraft({ ...consorcioDraft, buildingLocality: event.target.value })}
                        placeholder="Ej. Yerba Buena, San Miguel de Tucumán"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Direccion</Label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          value={consorcioDraft.buildingAddress}
                          onChange={(event) => setConsorcioDraft({ ...consorcioDraft, buildingAddress: event.target.value })}
                          placeholder="Ej. Av. Aconquija 1234"
                          required
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={locateConsorcioAddress}
                          disabled={consorcioLocationSearching || !consorcioDraft.buildingAddress.trim()}
                        >
                          {consorcioLocationSearching ? 'Ubicando...' : 'Ubicar'}
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Si no encontramos la direccion exacta, puedes elegir la ubicacion manualmente sobre el mapa.
                    </p>
                  </div>
                </div>

                <div className="flex-[1.35] overflow-hidden rounded-2xl border border-border/60 bg-background">
                  <div className="h-[320px]">
                    <DynamicMap
                      center={consorcioMapLocation ?? [-26.8306, -65.2038]}
                      zoom={consorcioMapLocation ? 16 : 13}
                      recenterKey={mapRecenterKey}
                      interactive
                      selectedLocation={consorcioMapLocation}
                      onLocationSelect={(lat, lng) => {
                        setConsorcioDraft((current) => ({
                          ...current,
                          latitude: String(lat),
                          longitude: String(lng),
                        }))
                        void reverseGeocodeToAddress(lat, lng)
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentConsorcioStep.id === 'admin' && (
          <div className="space-y-5">
            <div>
              <p className="text-xs text-muted-foreground">
                Esta es la cuenta con la que el administrador <strong>inicia sesión</strong> y opera el consorcio
                (cobranzas, gastos, liquidaciones, vecinos).
              </p>
            </div>

            <div className="inline-flex rounded-lg border border-border/50 p-0.5 text-sm">
              <button
                type="button"
                onClick={() => setConsorcioDraft({ ...consorcioDraft, adminMode: 'existing' })}
                className={`rounded-md px-3 py-1.5 transition-colors ${
                  consorcioDraft.adminMode === 'existing' ? 'bg-primary/10 text-foreground font-medium' : 'text-muted-foreground'
                }`}
              >
                Elegir existente
              </button>
              <button
                type="button"
                onClick={() => setConsorcioDraft({ ...consorcioDraft, adminMode: 'new' })}
                className={`rounded-md px-3 py-1.5 transition-colors ${
                  consorcioDraft.adminMode === 'new' ? 'bg-primary/10 text-foreground font-medium' : 'text-muted-foreground'
                }`}
              >
                Crear nuevo
              </button>
            </div>

            {consorcioDraft.adminMode === 'existing' ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                <select
                  className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm"
                  value={consorcioDraft.adminProfileId}
                  onChange={(e) => setConsorcioDraft({ ...consorcioDraft, adminProfileId: e.target.value })}
                >
                  <option value="">Seleccionar admin consorcio</option>
                  {consorcioAdmins.map((admin) => (
                    <option key={admin.profileId} value={admin.profileId}>
                      {admin.fullName} · {admin.email}
                    </option>
                  ))}
                </select>
                <div className="md:col-span-2 rounded-lg border border-border/40 bg-background/60 px-3 py-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    {selectedConsorcioAdmin ? selectedConsorcioAdmin.fullName : 'Sin admin seleccionado'}
                  </p>
                  <p className="mt-1">{describeAdminAssignment(selectedConsorcioAdmin)}</p>
                  {selectedConsorcioAdmin && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge color="default">
                        {selectedConsorcioAdmin.assignedBuildingsCount} country
                        {selectedConsorcioAdmin.assignedBuildingsCount === 1 ? '' : 's'}
                      </Badge>
                      {selectedConsorcioAdmin.primaryBuildingName && (
                        <Badge color="primary">Primario: {selectedConsorcioAdmin.primaryBuildingName}</Badge>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Se crea una cuenta con rol admin consorcio. Con este email y contraseña podrá iniciar sesión y operar el country.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Input
                    placeholder="Nombre y apellido"
                    value={consorcioDraft.newAdminFullName}
                    onChange={(e) => setConsorcioDraft({ ...consorcioDraft, newAdminFullName: e.target.value })}
                  />
                  <Input
                    placeholder="Email"
                    type="email"
                    value={consorcioDraft.newAdminEmail}
                    onChange={(e) => setConsorcioDraft({ ...consorcioDraft, newAdminEmail: e.target.value })}
                  />
                  <Input
                    placeholder="Contraseña inicial"
                    value={consorcioDraft.newAdminPassword}
                    onChange={(e) => setConsorcioDraft({ ...consorcioDraft, newAdminPassword: e.target.value })}
                  />
                </div>
              </div>
            )}

            {/* Bloque opcional: administración (facturación) + configuración avanzada */}
            <div className="rounded-xl border border-border/40 bg-background/50">
              <button
                type="button"
                onClick={() => setShowOptional((v) => !v)}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">Datos opcionales</span>
                    <Badge color="default">Opcional</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Administración (facturación) y configuración. Si lo dejás vacío, se autocompleta y lo editás después.
                  </p>
                </div>
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${showOptional ? 'rotate-180' : ''}`} />
              </button>

              {showOptional && (
                <div className="space-y-5 border-t border-border/40 px-4 py-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Administración (facturación)</p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <Input
                        placeholder="Nombre de la administración"
                        value={consorcioDraft.administrationName}
                        onChange={(event) => {
                          setAdministrationNameTouched(true)
                          setConsorcioDraft({ ...consorcioDraft, administrationName: event.target.value })
                        }}
                      />
                      <Input
                        placeholder="Razón social"
                        value={consorcioDraft.administrationLegalName}
                        onChange={(event) => setConsorcioDraft({ ...consorcioDraft, administrationLegalName: event.target.value })}
                      />
                      <Input
                        placeholder="CUIT"
                        value={consorcioDraft.administrationTaxId}
                        onChange={(event) => setConsorcioDraft({ ...consorcioDraft, administrationTaxId: event.target.value })}
                      />
                      <Input
                        placeholder="Email"
                        type="email"
                        value={consorcioDraft.administrationContactEmail}
                        onChange={(event) => setConsorcioDraft({ ...consorcioDraft, administrationContactEmail: event.target.value })}
                      />
                      <Input
                        placeholder="Teléfono"
                        value={consorcioDraft.administrationContactPhone}
                        onChange={(event) => setConsorcioDraft({ ...consorcioDraft, administrationContactPhone: event.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Configuración</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <Input
                        placeholder="CUIT del consorcio"
                        value={consorcioDraft.propertyTaxId}
                        onChange={(e) => setConsorcioDraft({ ...consorcioDraft, propertyTaxId: e.target.value })}
                      />
                      <Input
                        placeholder="Inicio de gestión"
                        type="date"
                        value={consorcioDraft.managedSince}
                        onChange={(e) => setConsorcioDraft({ ...consorcioDraft, managedSince: e.target.value })}
                      />
                      <Input
                        placeholder="Fee administración (%)"
                        inputMode="decimal"
                        value={consorcioDraft.managementFeePct}
                        onChange={(e) => setConsorcioDraft({ ...consorcioDraft, managementFeePct: e.target.value })}
                      />
                      <textarea
                        className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm outline-none md:col-span-3"
                        rows={2}
                        placeholder="Notas iniciales"
                        value={consorcioDraft.notes}
                        onChange={(e) => setConsorcioDraft({ ...consorcioDraft, notes: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {currentConsorcioStep.id === 'summary' && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resumen y confirmacion</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Revisa todo antes de crear. Si algo no esta bien, puedes volver al paso anterior sin perder lo cargado.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border/40 bg-background/60 p-4">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">El consorcio</div>
                <div className="mt-2 text-sm font-semibold text-foreground">
                  {consorcioDraft.displayName.trim() || consorcioDraft.buildingName || 'Sin nombre'}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tipo: {PROPERTY_KIND_OPTIONS.find((option) => option.value === consorcioDraft.propertyKind)?.label}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{consorcioDraft.buildingAddress || 'Sin direccion'}</p>
                <p className="mt-2 text-xs text-muted-foreground">Unidades: {consorcioDraft.totalUnits || '0'}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Ubicacion:{' '}
                  {consorcioMapLocation
                    ? `${consorcioMapLocation[0].toFixed(5)}, ${consorcioMapLocation[1].toFixed(5)}`
                    : 'sin coordenadas seleccionadas'}
                </p>
              </div>
              <div className="rounded-xl border border-border/40 bg-background/60 p-4">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Administrador</div>
                {consorcioDraft.adminMode === 'new' ? (
                  <>
                    <div className="mt-2 text-sm font-semibold text-foreground">
                      {consorcioDraft.newAdminFullName.trim() || 'Nuevo admin'}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{consorcioDraft.newAdminEmail.trim() || 'Falta el email'}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Se creará una cuenta nueva con rol admin consorcio.</p>
                  </>
                ) : (
                  <>
                    <div className="mt-2 text-sm font-semibold text-foreground">
                      {selectedConsorcioAdmin?.fullName || 'Sin admin seleccionado'}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedConsorcioAdmin?.email || 'Debes seleccionar un admin consorcio'}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">{describeAdminAssignment(selectedConsorcioAdmin)}</p>
                  </>
                )}
              </div>
              <div className="rounded-xl border border-border/40 bg-background/60 p-4 md:col-span-2">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Datos opcionales</div>
                  <Badge color="default">Opcional</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Administración: {administrationSummaryName || 'se usará el nombre del consorcio'}
                  {hasAdministrationCustomData
                    ? ''
                    : ' (mínima, autocompletada)'}
                </p>
                {(consorcioDraft.administrationContactEmail.trim() || consorcioDraft.administrationLegalName.trim() || consorcioDraft.administrationTaxId.trim()) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {consorcioDraft.administrationLegalName.trim() || 'Sin razón social'}
                    {consorcioDraft.administrationTaxId.trim() ? ` · CUIT ${consorcioDraft.administrationTaxId.trim()}` : ''}
                    {consorcioDraft.administrationContactEmail.trim() ? ` · ${consorcioDraft.administrationContactEmail.trim()}` : ''}
                  </p>
                )}
                {(consorcioDraft.managedSince || consorcioDraft.managementFeePct) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {consorcioDraft.managedSince ? `Gestión desde ${consorcioDraft.managedSince}` : ''}
                    {consorcioDraft.managementFeePct ? ` · Fee ${consorcioDraft.managementFeePct}%` : ''}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-border/40 pt-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <button
            type="button"
            onClick={resetConsorcioDraft}
            className="rounded-lg border border-border/50 px-3 py-2 text-xs font-semibold text-muted-foreground"
          >
            Limpiar wizard
          </button>
          {getConsorcioStepError() && <p className="text-xs text-amber-700">{getConsorcioStepError()}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {consorcioStepIndex > 0 && (
            <button
              type="button"
              onClick={previousConsorcioStep}
              className="rounded-lg border border-border/50 px-4 py-2 text-sm font-semibold text-foreground"
            >
              Volver
            </button>
          )}
          {currentConsorcioStep.id !== 'summary' ? (
            <button type="button" onClick={nextConsorcioStep} className="rounded-lg px-4 py-2 text-sm font-semibold text-white btn-premium">
              Continuar
            </button>
          ) : (
            <button
              type="submit"
              disabled={pending || (consorcioDraft.adminMode === 'existing' && consorcioAdmins.length === 0)}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white btn-premium disabled:opacity-60"
            >
              {pending ? 'Creando...' : 'Crear consorcio'}
            </button>
          )}
        </div>
      </div>
    </form>
  )
}
