'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Bot, ChevronDown, Loader2, Send, Sparkles, X } from 'lucide-react'

// ─── types ───────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant'
  content: string
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function parseSSEChunk(raw: string): string {
  let text = ''
  const lines = raw.split('\n')
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue
    const data = line.slice(6).trim()
    if (data === '[DONE]') continue
    try {
      const json = JSON.parse(data)
      const delta = json?.choices?.[0]?.delta?.content
      if (typeof delta === 'string') text += delta
    } catch {
      // skip malformed chunks
    }
  }
  return text
}

// ─── inline markdown renderer ─────────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n')
  const result: React.ReactNode[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Bullet list: lines starting with '- ' or '* '
    if (/^[-*]\s/.test(line)) {
      result.push(
        <div key={i} className="flex gap-1.5 my-0.5">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
          <span>{renderInline(line.replace(/^[-*]\s/, ''))}</span>
        </div>
      )
      continue
    }

    // Empty line → spacing
    if (line.trim() === '') {
      result.push(<div key={i} className="h-1.5" />)
      continue
    }

    result.push(<div key={i}>{renderInline(line)}</div>)
  }

  return result
}

function renderInline(text: string): React.ReactNode {
  // Split on **bold**, *italic*, `code`
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return (
    <>
      {parts.map((part, idx) => {
        if (/^\*\*(.+)\*\*$/.test(part)) {
          return <strong key={idx} className="font-semibold">{part.slice(2, -2)}</strong>
        }
        if (/^\*(.+)\*$/.test(part)) {
          return <em key={idx}>{part.slice(1, -1)}</em>
        }
        if (/^`(.+)`$/.test(part)) {
          return (
            <code key={idx} className="rounded bg-muted px-1 py-0.5 text-xs font-mono text-foreground">
              {part.slice(1, -1)}
            </code>
          )
        }
        return <span key={idx}>{part}</span>
      })}
    </>
  )
}

// ─── bubble ──────────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isUser && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mr-2 mt-0.5"
          style={{ background: 'linear-gradient(135deg, #112250, #0a1838)' }}
        >
          <Bot className="w-3.5 h-3.5 text-white" />
        </div>
      )}
      <div
        className={`max-w-[88%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed sm:max-w-[80%] ${
          isUser
            ? 'text-white rounded-tr-sm whitespace-pre-wrap'
            : 'text-foreground rounded-tl-sm border border-border bg-card shadow-sm'
        }`}
        style={isUser ? { background: 'linear-gradient(135deg, #112250, #0a1838)' } : undefined}
      >
        {isUser ? msg.content : renderMarkdown(msg.content)}
      </div>
    </div>
  )
}

// ─── quick suggestions ────────────────────────────────────────────────────────

const DEFAULT_SUGGESTIONS = [
  '¿Qué cupones tengo disponibles?',
  '¿Hay algo nuevo en el mercado vecinal?',
  '¿Cuál es el estado de mis reclamos?',
  '¿Qué promociones vencen pronto?',
]

function Suggestions({ onSelect, items }: { onSelect: (text: string) => void; items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2 border-t border-border/40 bg-muted/10 p-3">
      {items.map((s) => (
        <button
          key={s}
          onClick={() => onSelect(s)}
          className="rounded-full border border-border/50 bg-background/90 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
        >
          {s}
        </button>
      ))}
    </div>
  )
}

// ─── main widget ──────────────────────────────────────────────────────────────

export function ChatWidget({
  suggestions = DEFAULT_SUGGESTIONS,
  welcomeText = 'Puedo responder preguntas sobre tus cupones, el mercado vecinal, tus reclamos y más.',
}: {
  suggestions?: string[]
  welcomeText?: string
} = {}) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim()
    if (!content || isStreaming) return

    setInput('')
    setError(null)

    const userMsg: Message = { role: 'user', content }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setIsStreaming(true)

    // Placeholder assistant message that we'll stream into
    const assistantPlaceholder: Message = { role: 'assistant', content: '' }
    setMessages((prev) => [...prev, assistantPlaceholder])

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Error del servidor.')
      }

      if (!res.body) throw new Error('Sin respuesta.')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        const delta = parseSSEChunk(chunk)
        if (delta) {
          accumulated += delta
          setMessages((prev) => {
            const copy = [...prev]
            copy[copy.length - 1] = { role: 'assistant', content: accumulated }
            return copy
          })
        }
      }
    } catch (err: any) {
      setError(err?.message ?? 'Ocurrió un error. Intentá de nuevo.')
      // Remove the empty assistant placeholder on error
      setMessages((prev) => prev.filter((_, i) => i !== prev.length - 1))
    } finally {
      setIsStreaming(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const isEmpty = messages.length === 0

  return (
    <>
      {/* ── Floating button ─────────────────────────────────────────────────── */}
      <button
        id="ai-chat-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-label="Abrir asistente IA"
        className="fixed bottom-24 right-3 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-2xl transition-all hover:scale-110 active:scale-95 sm:right-4"
        style={{
          background: 'linear-gradient(135deg, #112250, #0a1838)',
          boxShadow: '0 8px 32px rgba(10, 24, 56,0.45)',
        }}
      >
        {open ? (
          <ChevronDown className="w-6 h-6 text-white" />
        ) : (
          <Sparkles className="w-6 h-6 text-white" />
        )}
      </button>

      {/* ── Chat panel ──────────────────────────────────────────────────────── */}
      <div
        className={`fixed inset-x-3 bottom-20 z-50 flex max-h-[min(76vh,42rem)] flex-col overflow-hidden rounded-[1.6rem] border border-border bg-background/95 shadow-[0_24px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl transition-all duration-300 sm:inset-x-auto sm:bottom-40 sm:right-4 sm:w-[min(380px,calc(100vw-2rem))] ${
          open ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
        style={{ boxShadow: '0 24px 80px rgba(10, 24, 56,0.16)' }}
      >
        {/* Header */}
        <div
          className="flex flex-shrink-0 items-center justify-between px-4 py-3"
          style={{ background: 'linear-gradient(135deg, #112250, #0a1838)' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm leading-tight">Asistente Countrify</p>
              <p className="text-white/70 text-xs">Powered by IA</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-white/70 hover:text-white transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages area */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {isEmpty && (
            <div className="flex h-full flex-col items-center justify-center gap-3 pb-4 text-center">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{ background: 'linear-gradient(135deg, rgba(17, 34, 80,0.15), rgba(10, 24, 56,0.1))' }}
              >
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">¡Hola! Soy tu asistente</p>
                <p className="text-muted-foreground text-xs mt-1 leading-relaxed">
                  {welcomeText}
                </p>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}

          {isStreaming && messages[messages.length - 1]?.content === '' && (
            <div className="flex items-center gap-2 ml-9 mb-3">
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
              <span className="text-xs text-muted-foreground">Pensando...</span>
            </div>
          )}

          {error && (
            <div className="mx-1 mb-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Suggestions (only when empty) */}
        {isEmpty && <Suggestions onSelect={(s) => sendMessage(s)} items={suggestions} />}

        {/* Input */}
        <div
          className="flex flex-shrink-0 items-end gap-2 border-t border-border/40 bg-background/90 px-3 py-3"
        >
          <textarea
            ref={inputRef}
            id="ai-chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribí tu pregunta..."
            rows={1}
            disabled={isStreaming}
            className="max-h-28 flex-1 resize-none overflow-y-auto bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
            style={{ minHeight: '24px' }}
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = Math.min(el.scrollHeight, 112) + 'px'
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isStreaming}
            id="ai-chat-send"
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
            style={{ background: 'linear-gradient(135deg, #112250, #0a1838)' }}
            aria-label="Enviar mensaje"
          >
            {isStreaming ? (
              <Loader2 className="w-4 h-4 text-white animate-spin" />
            ) : (
              <Send className="w-4 h-4 text-white" />
            )}
          </button>
        </div>
      </div>
    </>
  )
}
