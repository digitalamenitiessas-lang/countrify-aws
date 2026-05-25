import Link from 'next/link'

const SECTIONS = [
  { href: '/legal/terminos', label: 'Términos y Condiciones' },
  { href: '/legal/privacidad', label: 'Política de Privacidad' },
  { href: '/legal/cookies', label: 'Política de Cookies' },
]

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background pt-20 pb-24">
      <div className="mx-auto max-w-4xl px-6">
        <nav className="flex flex-wrap gap-2 mb-8 border-b border-border/40 pb-4">
          {SECTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="text-sm px-3 py-1.5 rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
            >
              {s.label}
            </Link>
          ))}
        </nav>
        <article className="prose prose-sm dark:prose-invert max-w-none">
          {children}
        </article>
      </div>
    </div>
  )
}
