'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  value: number
  format?: (n: number) => string
  duration?: number
  className?: string
}

/**
 * Contador animado que interpola suavemente entre el valor previo y el nuevo.
 * Sin dependencias: usa requestAnimationFrame con easing cúbico.
 *
 * Uso: <AnimatedNumber value={1234.5} format={(n) => `$ ${formatARS(n)}`} />
 */
export function AnimatedNumber({
  value,
  format = (n) => Math.round(n).toLocaleString('es-AR'),
  duration = 560,
  className,
}: Props) {
  const [display, setDisplay] = useState(value)
  const previousRef = useRef(value)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const from = previousRef.current
    const to = value
    if (from === to) return

    const start = performance.now()
    const step = (now: number) => {
      const elapsed = now - start
      const t = Math.min(1, elapsed / duration)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(from + (to - from) * eased)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        previousRef.current = to
      }
    }

    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [value, duration])

  return <span className={className}>{format(display)}</span>
}
