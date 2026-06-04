'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { CircleAlert, Clock3, FileStack, MessageSquareText, Plus, Sparkles, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  CaseDetailTabs,
  ComplaintEmptyState,
  ComplaintListSearch,
  ComplaintMessageComposer,
  ComplaintSectionHeader,
  StatusBadge,
  renderMessageWithMentions,
  statusCopy,
} from '@/components/complaints/case-shared'
import type {
  Building,
  ComplaintCaseDetailNeighborView,
  ComplaintCaseListItem,
  ComplaintCaseMentionableUser,
  ComplaintCaseMessageMention,
  ComplaintCaseMessageView,
  ComplaintCaseSection,
  ComplaintReason,
} from '@/lib/types'

async function readJsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = typeof data?.error === 'string' ? data.error : 'Ocurrio un error inesperado.'
    throw new Error(message)
  }
  return data as T
}

function mapNeighborDetail(row: any, mentionableUsers: ComplaintCaseMentionableUser[]): ComplaintCaseDetailNeighborView {
  return {
    id: row.id,
    caseCode: row.case_code,
    buildingId: row.building_id,
    buildingName: row.building_name ?? 'Edificio',
    title: row.title,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at ?? null,
    closedAt: row.closed_at ?? null,
    otherReasonText: row.other_reason_text ?? null,
    reasons: row.reasons ?? [],
    messages: row.messages ?? [],
    events: row.events ?? [],
    mentionableUsers,
    canReply: Boolean(row.can_reply),
    canChangeStatus: Boolean(row.can_change_status),
    defaultSection: 'summary',
  }
}

function buildListItem(detail: ComplaintCaseDetailNeighborView): ComplaintCaseListItem {
  const lastEvent = [...detail.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  return {
    id: detail.id,
    caseCode: detail.caseCode,
    buildingId: detail.buildingId,
    buildingName: detail.buildingName,
    title: detail.title,
    status: detail.status,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    lastEventAt: lastEvent?.createdAt ?? detail.updatedAt,
    lastEventSummary: lastEvent?.summary ?? null,
    reasons: detail.reasons,
    otherReasonText: detail.otherReasonText,
    messageCount: detail.messages.length,
    eventCount: detail.events.length,
    canReply: detail.canReply,
    canChangeStatus: detail.canChangeStatus,
  }
}

function mapMessageMentions(rows: any[] | null | undefined): ComplaintCaseMessageMention[] {
  return (rows ?? []).map((row: any) => ({
    id: row.id,
    messageId: row.message_id,
    mentionedProfileId: row.mentioned_profile_id,
    label: row.label,
  }))
}

export function NeighborCasesPanel({
  building,
  initialReasons,
  initialMentionableUsers,
  initialCases,
  initialCaseDetails,
}: {
  building: Building | null
  initialReasons: ComplaintReason[]
  initialMentionableUsers: ComplaintCaseMentionableUser[]
  initialCases: ComplaintCaseListItem[]
  initialCaseDetails: ComplaintCaseDetailNeighborView[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const rawSection = searchParams.get('complaintsSection')
  const initialSelectedSection: ComplaintCaseSection = (() => {
    if (rawSection === 'summary' || rawSection === 'forum' || rawSection === 'events') {
      return rawSection
    }
    if (typeof window === 'undefined') return 'summary'
    const stored = window.localStorage.getItem('citify-neighbor-complaints-section-v1')
    return stored === 'forum' || stored === 'events' ? stored : 'summary'
  })()
  const [cases, setCases] = useState(initialCases)
  const [caseDetails, setCaseDetails] = useState(initialCaseDetails)
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(initialCases[0]?.id ?? null)
  const [selectedSection, setSelectedSection] = useState<ComplaintCaseSection>(initialSelectedSection)
  const [selectedReasonIds, setSelectedReasonIds] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [otherReasonText, setOtherReasonText] = useState('')
  const [messageBody, setMessageBody] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(initialCases.length === 0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSendingMessage, setIsSendingMessage] = useState(false)

  const selectedReasons = useMemo(() => initialReasons.filter((reason) => selectedReasonIds.includes(reason.id)), [initialReasons, selectedReasonIds])
  const includesOther = useMemo(() => selectedReasons.some((reason) => reason.isOther), [selectedReasons])
  const filteredCases = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) {
      return cases
    }
    return cases.filter((item) =>
      [item.caseCode, item.title, item.lastEventSummary ?? '', item.reasons.map((reason) => reason.label).join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(query),
    )
  }, [cases, searchTerm])
  const selectedCase = useMemo(
    () => caseDetails.find((detail) => detail.id === selectedCaseId) ?? null,
    [caseDetails, selectedCaseId],
  )
  const stats = useMemo(
    () => ({
      total: cases.length,
      abiertos: cases.filter((item) => !['resuelto', 'cerrado'].includes(item.status)).length,
      enProceso: cases.filter((item) => ['en_revision', 'en_desarrollo', 'en_espera'].includes(item.status)).length,
      resueltos: cases.filter((item) => item.status === 'resuelto').length,
    }),
    [cases],
  )

  useEffect(() => {
    if (!filteredCases.length) {
      setSelectedCaseId(null)
      return
    }
    if (!selectedCaseId || !filteredCases.some((item) => item.id === selectedCaseId)) {
      setSelectedCaseId(filteredCases[0].id)
    }
  }, [filteredCases, selectedCaseId])

  // URL → state. NO depende de `selectedSection`, porque si lo hacíamos, al
  // cambiar de tab este effect se re-disparaba con la URL vieja y reseteaba
  // el state al valor anterior (bucle visible saltando entre tabs).
  useEffect(() => {
    if (rawSection === 'summary' || rawSection === 'forum' || rawSection === 'events') {
      setSelectedSection((prev) => (prev === rawSection ? prev : rawSection))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSection])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('citify-neighbor-complaints-section-v1', selectedSection)
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

  function toggleReason(reasonId: string) {
    setSelectedReasonIds((current) => (current.includes(reasonId) ? current.filter((value) => value !== reasonId) : [...current, reasonId]))
  }

  async function handleCreateCase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!building) {
      toast.error('No hay edificio asignado.')
      return
    }
    if (selectedReasonIds.length === 0) {
      toast.error('Selecciona al menos un motivo.')
      return
    }
    if (!title.trim() || !description.trim()) {
      toast.error('Completa el titulo y la descripcion.')
      return
    }

    setIsSubmitting(true)
    let createdRow: any = null
    try {
      const payload = await readJsonResponse<{ ok: true; case: any }>(
        await fetch('/api/complaints/neighbor/cases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            reasonIds: selectedReasonIds,
            otherReasonText: includesOther ? otherReasonText.trim() : null,
          }),
        }),
      )
      createdRow = payload.case
    } catch (error) {
      setIsSubmitting(false)
      toast.error(error instanceof Error ? error.message : 'No se pudo crear el expediente.')
      return
    }
    setIsSubmitting(false)
    if (!createdRow) {
      toast.error('No se pudo recuperar el expediente creado.')
      return
    }

    const detail = mapNeighborDetail(createdRow, initialMentionableUsers)
    const item = buildListItem(detail)
    setCaseDetails((current) => [detail, ...current])
    setCases((current) => [item, ...current])
    setSelectedCaseId(detail.id)
    setSelectedSection('summary')
    setSelectedReasonIds([])
    setTitle('')
    setDescription('')
    setOtherReasonText('')
    setSearchTerm('')
    setShowCreateForm(false)
    toast.success(`Expediente ${detail.caseCode} creado.`)
  }

  async function handleSendMessage(mentionedProfileIds: string[]) {
    if (!selectedCase || !messageBody.trim()) {
      return false
    }

    setIsSendingMessage(true)
    let messageRow: any = null
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
      messageRow = payload.message
    } catch (error) {
      setIsSendingMessage(false)
      toast.error(error instanceof Error ? error.message : 'No se pudo publicar el comentario.')
      return false
    }
    setIsSendingMessage(false)
    if (!messageRow) {
      toast.error('No se pudo registrar el comentario.')
      return false
    }

    const createdAt = messageRow.created_at ?? new Date().toISOString()
    const message: ComplaintCaseMessageView = {
      id: messageRow.id,
      caseId: selectedCase.id,
      message: messageBody.trim(),
      messageType: messageRow.message_type,
      authorLabel: messageRow.author_label ?? 'Vecino del edificio',
      authorRole: messageRow.author_role ?? 'vecino',
      mentions: mapMessageMentions(messageRow.mentions),
      createdAt,
    }

    setCaseDetails((current) =>
      current.map((detail) =>
        detail.id === selectedCase.id
          ? {
              ...detail,
              updatedAt: createdAt,
              messages: [...detail.messages, message],
              events: [
                ...detail.events,
                {
                  id: `${message.id}-event`,
                  caseId: detail.id,
                  eventType: 'message_posted',
                  actorLabel: message.authorLabel,
                  actorRole: message.authorRole,
                  summary: 'Nuevo comentario en el expediente',
                  metadata: { message_type: message.messageType },
                  createdAt,
                },
              ],
            }
          : detail,
      ),
    )
    setCases((current) =>
      current.map((item) =>
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
      ),
    )
    setMessageBody('')
    toast.success('Comentario publicado.')
    return true
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Expedientes', value: stats.total },
          { label: 'Abiertos', value: stats.abiertos },
          { label: 'En proceso', value: stats.enProceso },
          { label: 'Resueltos', value: stats.resueltos },
        ].map((stat) => (
          <div key={stat.label} className="glass-card rounded-2xl p-4">
            <div className="text-2xl font-bold text-foreground">{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.92fr,1.08fr]">
        <div className="space-y-6">
          <div className="glass-card rounded-3xl p-6 border border-border/60">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <p className="text-xs font-medium tracking-wider uppercase text-primary">Mesa de entradas</p>
                </div>
                <h3 className="font-serif text-2xl font-bold text-foreground">Nuevo expediente anonimo</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Crea un reclamo nuevo separado del seguimiento existente para mantener cada expediente bien ordenado.
                </p>
              </div>
              <Button type="button" variant={showCreateForm ? 'secondary' : 'default'} className="gap-2" onClick={() => setShowCreateForm((current) => !current)}>
                <Plus className="w-4 h-4" />
                {showCreateForm ? 'Ocultar formulario' : 'Nuevo expediente'}
              </Button>
            </div>

            {showCreateForm ? (
              <form onSubmit={handleCreateCase} className="space-y-5 mt-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Tags className="w-4 h-4 text-primary" />
                    Paso 1. Motivos del reclamo
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {initialReasons.map((reason) => {
                      const active = selectedReasonIds.includes(reason.id)
                      return (
                        <button
                          key={reason.id}
                          type="button"
                          onClick={() => toggleReason(reason.id)}
                          className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-border/70 bg-background/60 text-muted-foreground hover:text-foreground'}`}
                        >
                          {reason.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {includesOther ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Paso 2. Contanos el otro motivo</label>
                    <Input value={otherReasonText} onChange={(event) => setOtherReasonText(event.target.value)} placeholder="Ej: olor fuerte en cocheras" />
                  </div>
                ) : null}

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Paso 3. Titulo breve</label>
                  <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="Ej: Ascensor del cuerpo A se detiene entre pisos" />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Paso 4. Descripcion guiada</label>
                  <Textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={5}
                    maxLength={1400}
                    placeholder={`Conta que pasa, desde cuando y en que sector de ${building?.name ?? 'tu edificio'} aparece el problema.`}
                  />
                </div>

                <div className="rounded-2xl border border-border/60 bg-background/50 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                    <FileStack className="w-4 h-4 text-primary" />
                    Vista previa
                  </div>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p><span className="font-medium text-foreground">Codigo:</span> se genera automaticamente al enviar</p>
                    <p><span className="font-medium text-foreground">Motivos:</span> {selectedReasons.length > 0 ? selectedReasons.map((reason) => reason.label).join(', ') : 'Todavia no seleccionaste motivos'}</p>
                    <p><span className="font-medium text-foreground">Titulo:</span> {title.trim() || 'Todavia sin titulo'}</p>
                    <p><span className="font-medium text-foreground">Anonimato:</span> los vecinos veran el expediente sin identidad del autor.</p>
                  </div>
                </div>

                <Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
                  {isSubmitting ? 'Creando expediente...' : 'Crear expediente'}
                </Button>
              </form>
            ) : null}
          </div>

          <div className="glass-card rounded-3xl p-6 border border-border/60">
            <ComplaintSectionHeader
              icon={<FileStack className="w-4 h-4" />}
              title="Bandeja de expedientes"
              subtitle="Busca, selecciona y navega expediente por expediente."
            />

            <div className="mt-4 space-y-4">
              <ComplaintListSearch value={searchTerm} onValueChange={setSearchTerm} placeholder="Buscar por codigo, titulo o motivo..." />

              <div className="space-y-3 max-h-[34rem] overflow-y-auto pr-1">
                {filteredCases.length > 0 ? (
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
                    title={cases.length ? 'No encontramos expedientes con ese filtro' : 'Todavia no hay expedientes'}
                    description={cases.length ? 'Prueba con otro titulo, codigo o motivo.' : 'El primero que generes va a aparecer aca con su codigo y seguimiento.'}
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
                    Navega el expediente por secciones para ver el resumen, el foro o el historial de movimientos sin mezclar todo en una sola vista.
                  </p>
                </div>
                <StatusBadge status={selectedCase.status} />
              </div>

              <CaseDetailTabs value={selectedSection} onValueChange={setSelectedSection} />

              {selectedSection === 'summary' ? (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-border/60 bg-background/40 p-5">
                    <h4 className="text-sm font-semibold text-foreground">Descripcion del expediente</h4>
                    <p className="text-sm text-muted-foreground mt-3 leading-7">{selectedCase.description}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {selectedCase.reasons.map((reason) => (
                      <Badge key={reason.id} variant="secondary">{reason.label}</Badge>
                    ))}
                    {selectedCase.otherReasonText ? <Badge variant="outline">Otros: {selectedCase.otherReasonText}</Badge> : null}
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Creado</div>
                      <div className="text-sm font-medium text-foreground mt-1">{new Date(selectedCase.createdAt).toLocaleString('es-AR')}</div>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Ultimo movimiento</div>
                      <div className="text-sm font-medium text-foreground mt-1">{new Date(selectedCase.updatedAt).toLocaleString('es-AR')}</div>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Estado actual</div>
                      <div className="text-sm font-medium text-foreground mt-1">{statusCopy(selectedCase.status).label}</div>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedSection === 'forum' ? (
                <div className="space-y-5">
                  <ComplaintSectionHeader
                    icon={<MessageSquareText className="w-4 h-4" />}
                    title="Foro del expediente"
                    subtitle="Comparte contexto y arroba a vecinos o consorcio para ordenar la conversación."
                  />

                  <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
                    {selectedCase.messages.length > 0 ? (
                      selectedCase.messages.map((message) => (
                        <div key={message.id} className="rounded-2xl border border-border/60 bg-background/40 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant={message.authorRole === 'vecino' ? 'outline' : 'secondary'}>{message.authorLabel}</Badge>
                              <span className="text-xs text-muted-foreground">{new Date(message.createdAt).toLocaleString('es-AR')}</span>
                            </div>
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
                        description="El foro de este expediente se ira armando con respuestas del consorcio y vecinos del edificio."
                      />
                    )}
                  </div>

                  <ComplaintMessageComposer
                    label="Responder en el foro"
                    value={messageBody}
                    onValueChange={setMessageBody}
                    onSubmit={handleSendMessage}
                    mentionableUsers={selectedCase.mentionableUsers}
                    disabled={!selectedCase.canReply}
                    isSubmitting={isSendingMessage}
                    placeholder={selectedCase.canReply ? 'Escribi una actualizacion o usa @ para mencionar a alguien del edificio.' : 'Este expediente esta cerrado y no admite nuevas respuestas.'}
                    submitLabel="Publicar comentario"
                  />
                </div>
              ) : null}

              {selectedSection === 'events' ? (
                <div className="space-y-5">
                  <ComplaintSectionHeader
                    icon={<Clock3 className="w-4 h-4" />}
                    title="Movimientos del expediente"
                    subtitle="Bitacora cronologica de estados y eventos automaticos del caso."
                  />

                  <div className="space-y-3 max-h-[32rem] overflow-y-auto pr-1">
                    {selectedCase.events.length > 0 ? (
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
                        title="No hay movimientos todavia"
                        description="Los cambios de estado y acciones del expediente apareceran en esta linea de tiempo."
                      />
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="min-h-[30rem] flex items-center justify-center text-center">
              <div>
                <CircleAlert className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
                <p className="text-foreground font-medium">Todavia no seleccionaste un expediente</p>
                <p className="text-sm text-muted-foreground mt-1">Elige uno del listado para navegar su resumen, foro y movimientos.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
