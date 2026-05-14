'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Persistencia sencilla de UI preferences en localStorage, con SSR-safe initial
 * state y sync entre tabs abiertas.
 */
export function useLocalPref<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial)
  const [hydrated, setHydrated] = useState(false)

  // Cargar del storage al montar
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key)
      if (raw !== null) {
        setValue(JSON.parse(raw) as T)
      }
    } catch {
      // ignore
    } finally {
      setHydrated(true)
    }
  }, [key])

  // Persistir cuando cambia (después de hidratar)
  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // quota o SSR — ignorar
    }
  }, [key, value, hydrated])

  // Sincronizar entre tabs
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== key || e.newValue === null) return
      try {
        setValue(JSON.parse(e.newValue) as T)
      } catch {
        // ignore
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key])

  const update = useCallback<(v: T | ((prev: T) => T)) => void>((next) => {
    setValue((prev) => (typeof next === 'function' ? (next as (p: T) => T)(prev) : next))
  }, [])

  return [value, update]
}
