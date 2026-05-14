'use client'

import { useEffect } from 'react'

type HotkeyHandler = (event: KeyboardEvent) => void

export type HotkeyMap = Record<string, HotkeyHandler>

/**
 * Escucha teclas globales a nivel window y ejecuta el handler correspondiente.
 * Ignora eventos originados en inputs/textareas/contenteditable (excepto Escape
 * y Cmd/Ctrl+K que sí pasan siempre).
 *
 * Formato de las keys:
 *   "k" → tecla pura
 *   "mod+k" → Cmd en mac, Ctrl en otros
 *   "shift+?" → Shift + ?
 *
 * El callback recibe el evento por si querés hacer preventDefault extra.
 */
export function useHotkeys(map: HotkeyMap, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const isEditable = target
        ? target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable
        : false

      const mod = event.metaKey || event.ctrlKey
      const shift = event.shiftKey
      const keyLower = event.key.toLowerCase()

      // Construir la "signature" del evento
      const parts: string[] = []
      if (mod) parts.push('mod')
      if (shift) parts.push('shift')
      parts.push(keyLower)
      const signature = parts.join('+')

      // Buscar match exacto, después sin mod
      const handler = map[signature] ?? map[keyLower]
      if (!handler) return

      // Whitelist de atajos que disparan incluso dentro de inputs
      const alwaysPass = ['mod+k', 'escape']
      if (isEditable && !alwaysPass.includes(signature)) return

      handler(event)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [map, enabled])
}
