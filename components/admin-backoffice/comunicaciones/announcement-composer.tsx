'use client'

import { useState, useTransition } from 'react'
import { Copy, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { IAdminManagedProperty } from '@/lib/types'
import { generateAnnouncement, type AnnouncementDraft } from '@/app/iadmin/comunicaciones/actions'

type Props = {
  administrationId: string
  properties: Pick<IAdminManagedProperty, 'id' | 'displayName' | 'buildingName'>[]
}

type Variant = 'formal' | 'email' | 'whatsapp'

const VARIANT_LABEL: Record<Variant, string> = {
  formal: 'Cartelera / formal impreso',
  email: 'Email formal',
  whatsapp: 'WhatsApp',
}

export function AnnouncementComposer({ administrationId, properties }: Props) {
  const [pending, startTransition] = useTransition()
  const [propertyId, setPropertyId] = useState<string>('')
  const [topic, setTopic] = useState('')
  const [extraContext, setExtraContext] = useState('')
  const [draft, setDraft] = useState<AnnouncementDraft | null>(null)
  const [activeVariant, setActiveVariant] = useState<Variant>('email')

  function handleGenerate() {
    if (topic.trim().length < 5) {
      toast.error('Escribí un topic mas descriptivo')
      return
    }
    startTransition(async () => {
      try {
        const result = await generateAnnouncement({
          administrationId,
          managedPropertyId: propertyId || undefined,
          topic: topic.trim(),
          extraContext: extraContext.trim() || undefined,
        })
        setDraft(result)
        toast.success('Borrador listo')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error al generar')
      }
    })
  }

  async function handleCopy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copiado`)
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  return (
    <div className="space-y-6">
      <section className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="font-medium text-foreground">Nuevo comunicado</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {properties.length > 0 ? (
            <div className="space-y-1.5">
              <Label>Consorcio (opcional)</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
              >
                <option value="">— Toda la administracion —</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName ?? p.buildingName}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label>Tema del comunicado *</Label>
          <Textarea
            rows={2}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Ej: Aumento de expensas 15% desde abril por recomposicion salarial del encargado"
            maxLength={600}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Contexto adicional (opcional)</Label>
          <Textarea
            rows={2}
            value={extraContext}
            onChange={(e) => setExtraContext(e.target.value)}
            placeholder="Detalles que quieras que la IA incluya: fechas, motivos, numeros concretos"
            maxLength={1000}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleGenerate} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Generando…
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Generar borrador con IA
              </>
            )}
          </Button>
        </div>
      </section>

      {draft ? (
        <section className="glass-card rounded-2xl overflow-hidden">
          <header className="px-5 py-4 border-b border-border/40">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-serif text-lg font-semibold text-foreground">Borrador generado</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Asunto sugerido: <span className="font-medium">{draft.subjectSuggestion}</span>
                </p>
              </div>
              <div className="flex gap-1">
                {(['email', 'formal', 'whatsapp'] as Variant[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setActiveVariant(v)}
                    className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                      activeVariant === v
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {VARIANT_LABEL[v]}
                  </button>
                ))}
              </div>
            </div>
          </header>

          <div className="p-5 space-y-3">
            {activeVariant === 'email' ? (
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Asunto</div>
                <Input readOnly value={draft.subjectSuggestion} />
              </div>
            ) : null}

            <Textarea
              rows={activeVariant === 'whatsapp' ? 8 : 14}
              value={draft[activeVariant]}
              onChange={(e) => setDraft({ ...draft, [activeVariant]: e.target.value })}
              className="font-mono text-sm leading-relaxed"
            />

            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCopy(draft[activeVariant], VARIANT_LABEL[activeVariant])}
              >
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                Copiar texto
              </Button>
              {activeVariant === 'email' ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    handleCopy(`${draft.subjectSuggestion}\n\n${draft.email}`, 'email completo')
                  }
                >
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  Copiar asunto + cuerpo
                </Button>
              ) : null}
            </div>

            <p className="text-xs text-muted-foreground">
              Editá a gusto. El borrador se descarta si cerrás o generás otro.
            </p>
          </div>
        </section>
      ) : null}
    </div>
  )
}
