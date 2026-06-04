'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Building2, Clock3, FileStack, MessageSquareText, Tags, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  CaseDetailTabs,
  ComplaintEmptyState,
  ComplaintListSearch,
  ComplaintMessageComposer,
  ComplaintSectionHeader,
  StatusBadge,
  renderMessageWithMentions,
  sortReasonSummary,
  statusCopy,
} from '@/components/complaints/case-shared'
import type {
  ComplaintCaseDetailConsorcioView,
  ComplaintCaseEvent,
  ComplaintCaseMessageMention,
  ComplaintCaseMessageView,
  ComplaintCaseSection,
  ComplaintCaseStatus,
  ConsorcioDashboardData,
} from '@/lib/types'

async function readJsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = typeof data?.error === 'string' ? data.error : 'Ocurrio un error inesperado.'
    throw new Error(message)
  }
  return data as T
}

function mapMessageMentions(rows: any[] | null | undefined): ComplaintCaseMessageMention[] {
  return (rows ?? []).map((row: any) => ({
    id: row.id,
    messageId: row.message_id,
    mentionedProfileId: row.mentioned_profile_id,
    label: row.label,
  }))
}

export function ConsorcioCasesPanel({ data }: { data: ConsorcioDashboardData }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const rawSection = searchParams.get('complaintsSection')
  const initialSelectedSection: ComplaintCaseSection = (() => {
    if (rawSection === 'summary' || rawSection === 'forum' || rawSection === 'events') {
      return rawSection
    }
    if (typeof window === 'undefined') return 'summary'
    const stored = window.localStorage.getItem('citify-consorcio-complaints-section-v1')
    return stored === 'forum' || stored === 'events' ? stored : 'summary'
  })()
  const [managedBuildings, setManagedBuildings] = useState(data.managedBuildings)
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(data.primaryBuildingId)
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(data.managedBuildings[0]?.complaintCases[0]?.id ?? null)
  const [selectedSection, setSelectedSection] = useState<ComplaintCaseSection>(initialSelectedSection)
  const [searchTerm, setSearchTerm] = useState('')
  const [messageBody, setMessageBody] = useState('')
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [isChangingStatus, setIsChangingStatus] = useState(false)

  const selectedBuilding = useMemo(
    () => managedBuildings.find((building) => building.building.id === selectedBuildingId) ?? managedBuildings[0] ?? null,
    [managedBuildings, selectedBuildingId],
  )

  const filteredCases = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    const cases = selectedBuilding?.complaintCases ?? []
    if (!query) {
      return cases
    }
    return cases.filter((item) =>
      [item.caseCode, item.title, item.lastEventSummary ?? '', item.reasons.map((reason) => reason.label).join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(query),
    )
  }, [searchTerm, selectedBuilding])

  useEffect(() => {
    if (!filteredCases.length) {
      setSelectedCaseId(null)
      return
    }
    if (!selectedCaseId || !filteredCases.some((item) => item.id === selectedCaseId)) {
      setSelectedCaseId(filteredCases[0].id)
    }
  }, [filteredCases, selectedCaseId])

  const selectedCase = useMemo<ComplaintCaseDetailConsorcioView | null>(
    () => selectedBuilding?.complaintCaseDetails.find((detail) => detail.id === selectedCaseId) ?? null,
    [selectedBuilding, selectedCaseId],
  )

  // URL → state. NO depender de `selectedSection` (sino se revierte el state
  // al valor anterior cuando el usuario cambia de tab → bucle visible).
  useEffect(() => {
    if (rawSection === 'summary' || rawSection === 'forum' || rawSection === 'events') {
      setSelectedSection((prev) => (prev === rawSection ? prev : rawSection))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSection])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('citify-consorcio-complaints-section-v1', selectedSection)
    }
    const params = new URLSearchParams(searchParams.toString())
    if (selectedSection === 'summary') {
      params.delete('complaintsSection')
    } else {
      params.set('complaintsSection', selectedSection)
    }
    const nextQuery = params.toString()
    const currentQuery = searchParams.toString()
    if (nextQuery !== currentQuery) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false })
    }
  }, [pathname, router, searchParams, selectedSection])

  const globalReasonSummary = useMemo(() => sortReasonSummary(data.complaintReasonSummaries), [data.complaintReasonSummaries])
  const globalOpenCount = useMemo(
    () => managedBuildings.reduce((sum, item) => sum + item.complaintCases.filter((entry) => !['resuelto', 'cerrado'].includes(entry.status)).length, 0),
    [managedBuildings],
  )

  async function handleStatusChange(nextStatus: ComplaintCaseStatus) {
    if (!selectedCase || nextStatus === selectedCase.status) {
      return
    }
    setIsChangingStatus(true)
    let row: any = null
    try {
      const payload = await readJsonResponse<{ ok: true; result: any }>(
        await fetch(`/api/complaints/cases/${selectedCase.id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus }),
        }),
      )
      row = payload.result
    } catch (error) {
      setIsChangingStatus(false)
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar el estado.')
      return
    }
    setIsChangingStatus(false)
    const updatedAt = row?.updated_at ?? new Date().toISOString()
    const latestEventSummary = row?.latest_event_summary ?? `Estado actualizado a ${statusCopy(nextStatus).label}`
    const latestEventCreatedAt = row?.latest_event_created_at ?? updatedAt

    setManagedBuildings((current) =>
      current.map((building) => {
        const complaintCaseDetails = building.complaintCaseDetails.map((detail) =>
          detail.id === selectedCase.id
            ? (() => {
                const event: ComplaintCaseEvent = {
                  id: `${detail.id}-${latestEventCreatedAt}`,
                  caseId: detail.id,
                  eventType: nextStatus === 'cerrado' ? 'closed' : nextStatus === 'resuelto' ? 'resolved' : 'status_changed',
                  actorLabel: 'Consorcio',
                  actorRole: 'consorcio',
                  summary: latestEventSummary,
                  metadata: { to: nextStatus },
                  createdAt: latestEventCreatedAt,
                }

                return {
                ...detail,
                status: nextStatus,
                updatedAt,
                resolvedAt: row?.resolved_at ?? null,
                closedAt: row?.closed_at ?? null,
                canReply: nextStatus !== 'cerrado',
                events: [...detail.events, event],
              }
            })()
            : detail,
        )

        const complaintCases = building.complaintCases.map((item) =>
          item.id === selectedCase.id
            ? {
                ...item,
                status: nextStatus,
                updatedAt,
                lastEventAt: latestEventCreatedAt,
                lastEventSummary: latestEventSummary,
                eventCount: item.eventCount + 1,
                canReply: nextStatus !== 'cerrado',
              }
            : item,
        )

        return {
          ...building,
          complaintCaseDetails,
          complaintCases,
          complaintSummary: {
            ...building.complaintSummary,
            total: complaintCases.length,
            nuevo: complaintCases.filter((item) => item.status === 'nuevo').length,
            enRevision: complaintCases.filter((item) => item.status === 'en_revision').length,
            enDesarrollo: complaintCases.filter((item) => item.status === 'en_desarrollo').length,
            enEspera: complaintCases.filter((item) => item.status === 'en_espera').length,
            resuelto: complaintCases.filter((item) => item.status === 'resuelto').length,
            cerrado: complaintCases.filter((item) => item.status === 'cerrado').length,
          },
        }
      }),
    )
    toast.success('Estado actualizado.')
  }

  async function handleSendMessage(mentionedProfileIds: string[]) {
    if (!selectedCase || !messageBody.trim()) {
      return false
    }
    setIsSendingMessage(true)
    let row: any = null
    try {
      const payload = await readJsonResponse<{ ok: true; message: any }>(
        await fetch(`/api/complaints/cases/${selectedCase.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            body: messageBody.trim(),
            mentionedProfileIds,
          }),
        }),
      )
      row = payload.message
    } catch (error) {
      setIsSendingMessage(false)
      toast.error(error instanceof Error ? error.message : 'No se pudo publicar el comentario.')
      return false
    }
    setIsSendingMessage(false)
    const createdAt = row?.created_at ?? new Date().toISOString()
    const message: ComplaintCaseMessageView = {
      id: row?.id ?? `${selectedCase.id}-${createdAt}`,
      caseId: selectedCase.id,
      message: messageBody.trim(),
      messageType: row?.message_type ?? 'comment',
      authorLabel: row?.author_label ?? 'Consorcio',
      authorRole: row?.author_role ?? 'consorcio',
      mentions: mapMessageMentions(row?.mentions),
      createdAt,
    }

    setManagedBuildings((current) =>
      current.map((building) => {
        const complaintCaseDetails = building.complaintCaseDetails.map((detail) =>
          detail.id === selectedCase.id
            ? (() => {
                const event: ComplaintCaseEvent = {
                  id: `${message.id}-event`,
                  caseId: detail.id,
                  eventType: 'message_posted',
                  actorLabel: 'Consorcio',
                  actorRole: 'consorcio',
                  summary: 'Nuevo comentario en el expediente',
                  metadata: { message_type: message.messageType },
                  createdAt,
                }

                return {
                ...detail,
                updatedAt: createdAt,
                messages: [...detail.messages, message],
                events: [...detail.events, event],
              }
            })()
            : detail,
        )

        const complaintCases = building.complaintCases.map((item) =>
          item.id === selectedCase.id
            ? {
                ...item,
                updatedAt: createdAt,
                lastEventAt: createdAt,
                lastEventSummary: 'Nuevo comentario en el expediente',
                messageCount: item.messageCount + 1,
                eventCount: item.eventCount + 1,
              }
            : item,
        )

        return { ...building, complaintCaseDetails, complaintCases }
      }),
    )
    setMessageBody('')
    toast.success('Comentario publicado.')
    return true
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Expedientes', value: data.totalComplaintCases },
          { label: 'Abiertos', value: globalOpenCount },
          { label: 'Edificios con casos', value: managedBuildings.filter((item) => item.complaintCases.length > 0).length },
          { label: 'Motivo top', value: globalReasonSummary[0]?.reasonLabel ?? 'Sin datos' },
        ].map((stat) => (
          <div key={stat.label} className="glass-card rounded-2xl p-4">
            <div className="text-2xl font-bold text-foreground">{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.88fr,1.12fr]">
        <div className="space-y-6">
          <div className="glass-card rounded-3xl p-6 border border-border/60">
            <ComplaintSectionHeader
              icon={<Building2 className="w-4 h-4" />}
              title="Selector de edificio"
              subtitle="Primero elegi el edificio, despues el expediente que queres gestionar."
            />

            <div className="grid gap-3 mt-4">
              {managedBuildings.map((building) => (
                <button
                  key={building.building.id}
                  type="button"
                  onClick={() => {
                    setSelectedBuildingId(building.building.id)
                    setSearchTerm('')
                  }}
                  className={`rounded-2xl border p-4 text-left transition-colors ${selectedBuildingId === building.building.id ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-background/40 hover:border-primary/20'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{building.building.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">{building.building.address}</p>
                    </div>
                    <Badge variant="secondary">{building.complaintSummary.total} exp.</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    <span>{building.complaintSummary.enDesarrollo} en desarrollo</span>
                    <span>{building.complaintSummary.enRevision} en revision</span>
                    <span>{building.complaintSummary.resuelto} resueltos</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="glass-card rounded-3xl p-6 border border-border/60">
            <ComplaintSectionHeader
              icon={<Tags className="w-4 h-4" />}
              title="Motivos mas frecuentes"
              subtitle="Resumen rapido para detectar tendencias del edificio activo."
            />
            <div className="flex flex-wrap gap-2 mt-4">
              {(selectedBuilding?.reasonSummary.length ? sortReasonSummary(selectedBuilding.reasonSummary) : globalReasonSummary).slice(0, 10).map((reason) => (
                <Badge key={reason.reasonId} variant="outline">{reason.reasonLabel} · {reason.count}</Badge>
              ))}
            </div>
          </div>

          <div className="glass-card rounded-3xl p-6 border border-border/60">
            <ComplaintSectionHeader
              icon={<FileStack className="w-4 h-4" />}
              title="Bandeja del edificio"
              subtitle="Busca y abre cada expediente para navegar su detalle."
            />

            <div className="mt-4 space-y-4">
              <ComplaintListSearch value={searchTerm} onValueChange={setSearchTerm} placeholder="Buscar por codigo, titulo o motivo..." />

              <div className="space-y-3 max-h-[34rem] overflow-y-auto pr-1">
                {filteredCases.length ? (
                  filteredCases.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedCaseId(item.id)}
                      className={`w-full rounded-2xl border p-4 text-left transition-colors ${selectedCaseId === item.id ? 'border-primary/50 bg-primary/8 shadow-sm' : 'border-border/60 bg-background/40 hover:border-primary/20'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold tracking-wider text-primary">{item.caseCode}</p>
                          <h4 className="text-sm font-semibold text-foreground mt-1">{item.title}</h4>
                          <p className="text-xs text-muted-foreground mt-1">{item.reasons.map((reason) => reason.label).join(', ')}</p>
                        </div>
                        <StatusBadge status={item.status} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        <span>{item.messageCount} mensajes</span>
                        <span>{item.eventCount} movimientos</span>
                        <span>{new Date(item.lastEventAt).toLocaleDateString('es-AR')}</span>
                      </div>
                      {item.lastEventSummary ? <p className="mt-3 text-xs text-muted-foreground line-clamp-2">{item.lastEventSummary}</p> : null}
                    </button>
                  ))
                ) : (
                  <ComplaintEmptyState
                    title={selectedBuilding?.complaintCases.length ? 'No hay coincidencias para ese filtro' : 'Este edificio todavia no tiene expedientes'}
                    description={selectedBuilding?.complaintCases.length ? 'Prueba con otro codigo, titulo o motivo.' : 'Cuando entren nuevos reclamos, la bandeja del edificio va a aparecer aca.'}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-3xl p-6 border border-border/60">
          {selectedCase ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold tracking-wider text-primary">{selectedCase.caseCode}</p>
                  <h3 className="font-serif text-2xl font-bold text-foreground mt-1">{selectedCase.title}</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Gestiona el expediente por secciones para separar claramente resumen, conversación y auditoría.
                  </p>
                </div>
                <StatusBadge status={selectedCase.status} />
              </div>

              <CaseDetailTabs value={selectedSection} onValueChange={setSelectedSection} />

              {selectedSection === 'summary' ? (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Autor visible para gestion</div>
                    <div className="mt-2 flex items-start gap-3">
                      <div className="mt-1 text-primary"><UserRound className="w-4 h-4" /></div>
                      <div>
                        <div className="text-sm text-foreground font-medium">{selectedCase.author.fullName}</div>
                        <div className="text-xs text-muted-foreground mt-1">{selectedCase.author.email}</div>
                        <div className="text-xs text-muted-foreground mt-1">{selectedCase.author.unitLabel ?? 'Unidad sin informar'}</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-background/40 p-5">
                    <h4 className="text-sm font-semibold text-foreground">Descripcion del expediente</h4>
                    <p className="text-sm text-muted-foreground mt-3 leading-7">{selectedCase.description}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {selectedCase.reasons.map((reason) => <Badge key={reason.id} variant="secondary">{reason.label}</Badge>)}
                    {selectedCase.otherReasonText ? <Badge variant="outline">Otros: {selectedCase.otherReasonText}</Badge> : null}
                  </div>

                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Creado</div>
                      <div className="text-sm font-medium text-foreground mt-1">{new Date(selectedCase.createdAt).toLocaleString('es-AR')}</div>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Actualizado</div>
                      <div className="text-sm font-medium text-foreground mt-1">{new Date(selectedCase.updatedAt).toLocaleString('es-AR')}</div>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Resuelto</div>
                      <div className="text-sm font-medium text-foreground mt-1">{selectedCase.resolvedAt ? new Date(selectedCase.resolvedAt).toLocaleDateString('es-AR') : 'Pendiente'}</div>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Cierre</div>
                      <div className="text-sm font-medium text-foreground mt-1">{selectedCase.closedAt ? new Date(selectedCase.closedAt).toLocaleDateString('es-AR') : 'Abierto'}</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-sm font-medium text-foreground">Cambiar estado</label>
                    <div className="flex flex-wrap gap-2">
                      {(['nuevo', 'en_revision', 'en_desarrollo', 'en_espera', 'resuelto', 'cerrado'] as ComplaintCaseStatus[]).map((status) => (
                        <Button
                          key={status}
                          type="button"
                          variant={selectedCase.status === status ? 'default' : 'outline'}
                          onClick={() => void handleStatusChange(status)}
                          disabled={isChangingStatus}
                        >
                          {statusCopy(status).label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedSection === 'forum' ? (
                <div className="space-y-5">
                  <ComplaintSectionHeader
                    icon={<MessageSquareText className="w-4 h-4" />}
                    title="Foro del expediente"
                    subtitle="Conversa con vecinos y usa arrobas para dirigir cada seguimiento a la persona correcta."
                  />

                  <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
                    {selectedCase.messages.length ? (
                      selectedCase.messages.map((message) => (
                        <div key={message.id} className="rounded-2xl border border-border/60 bg-background/40 p-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={message.authorRole === 'vecino' ? 'outline' : 'secondary'}>{message.authorLabel}</Badge>
                            <span className="text-xs text-muted-foreground">{new Date(message.createdAt).toLocaleString('es-AR')}</span>
                            {message.mentions.length ? <Badge variant="outline">{message.mentions.length} menciones</Badge> : null}
                          </div>
                          <p className="text-sm text-muted-foreground mt-3 leading-7">
                            {renderMessageWithMentions(message.message, message.mentions)}
                          </p>
                        </div>
                      ))
                    ) : (
                      <ComplaintEmptyState
                        title="Todavia no hay mensajes"
                        description="El foro del expediente se usa para ordenar la conversación y dejar trazabilidad humana separada del historial."
                      />
                    )}
                  </div>

                  <ComplaintMessageComposer
                    label="Responder en el expediente"
                    value={messageBody}
                    onValueChange={setMessageBody}
                    onSubmit={handleSendMessage}
                    mentionableUsers={selectedCase.mentionableUsers}
                    disabled={!selectedCase.canReply}
                    isSubmitting={isSendingMessage}
                    placeholder={selectedCase.canReply ? 'Escribi una actualizacion, suma contexto y usa @ para mencionar vecinos o consorcio.' : 'El expediente esta cerrado y el foro quedo en solo lectura.'}
                    submitLabel="Publicar comentario"
                  />
                </div>
              ) : null}

              {selectedSection === 'events' ? (
                <div className="space-y-5">
                  <ComplaintSectionHeader
                    icon={<Clock3 className="w-4 h-4" />}
                    title="Historial de movimientos"
                    subtitle="Linea de tiempo operativa del expediente, separada del foro."
                  />

                  <div className="space-y-3 max-h-[32rem] overflow-y-auto pr-1">
                    {selectedCase.events.length ? (
                      selectedCase.events.map((event) => (
                        <div key={event.id} className="rounded-2xl border border-border/60 bg-background/40 p-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={event.actorRole === 'vecino' ? 'outline' : 'secondary'}>{event.actorLabel}</Badge>
                            <span className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString('es-AR')}</span>
                          </div>
                          <p className="text-sm font-medium text-foreground mt-3">{event.summary}</p>
                        </div>
                      ))
                    ) : (
                      <ComplaintEmptyState
                        title="No hay movimientos registrados"
                        description="Los cambios de estado y acciones automáticas del expediente aparecerán en esta línea de tiempo."
                      />
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="min-h-[28rem] flex items-center justify-center text-center">
              <div>
                <FileStack className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
                <p className="text-foreground font-medium">No hay expediente seleccionado</p>
                <p className="text-sm text-muted-foreground mt-1">Elegi un edificio y un expediente para gestionar resumen, foro y movimientos.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
