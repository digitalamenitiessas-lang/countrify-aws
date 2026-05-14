'use client'

import type { LucideIcon } from 'lucide-react'

type Action = {
  label: string
  onClick?: () => void
  href?: string
  kind?: 'primary' | 'secondary'
  shortcut?: string
}

type Props = {
  icon: LucideIcon
  title: string
  description?: string
  actions?: Action[]
  tone?: 'default' | 'success'
  compact?: boolean
}

/**
 * Empty state con personalidad: ícono sobre disco degradado, título serif,
 * descripción friendly, y hasta 2 CTAs. Tono "success" cuando realmente no
 * hay nada que hacer (ej. al día).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actions = [],
  tone = 'default',
  compact = false,
}: Props) {
  const iconBg = tone === 'success' ? 'bg-emerald-100 text-emerald-700' : 'kpi-icon-disc'
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'py-8 px-4' : 'py-12 px-6'} mesa-fade-in`}>
      <div className={`rounded-2xl flex items-center justify-center ${compact ? 'w-10 h-10' : 'w-14 h-14'} ${iconBg}`}>
        <Icon className={compact ? 'w-4 h-4' : 'w-6 h-6'} />
      </div>
      <h3 className={`font-serif font-semibold text-foreground ${compact ? 'text-sm mt-2.5' : 'text-lg mt-4'}`}>
        {title}
      </h3>
      {description ? (
        <p className={`text-muted-foreground max-w-sm ${compact ? 'text-xs mt-1' : 'text-sm mt-1.5'}`}>
          {description}
        </p>
      ) : null}
      {actions.length > 0 ? (
        <div className="mt-4 flex items-center gap-2 flex-wrap justify-center">
          {actions.map((a, i) => {
            const isPrimary = a.kind !== 'secondary'
            const cls = isPrimary
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-background border border-border/50 text-foreground hover:border-primary/40 hover:bg-muted/30'
            const content = (
              <>
                <span>{a.label}</span>
                {a.shortcut ? <span className="kbd-hint">{a.shortcut}</span> : null}
              </>
            )
            if (a.href) {
              return (
                <a
                  key={i}
                  href={a.href}
                  className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${cls}`}
                >
                  {content}
                </a>
              )
            }
            return (
              <button
                key={i}
                type="button"
                onClick={a.onClick}
                className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${cls}`}
              >
                {content}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
