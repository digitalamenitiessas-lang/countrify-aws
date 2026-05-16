import Link from 'next/link'
import { Facebook, Instagram, Linkedin, Mail } from 'lucide-react'

const CONTACT_EMAIL = 'digitalamenitiessas@gmail.com'

export function SiteFooter() {
  return (
    <footer className="relative z-10 bg-[#0c1a3d] text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/60">
            Countrify
          </p>
          <p className="text-sm text-white/80">
            Conectamos residentes, comercios y countries en una experiencia más simple.
          </p>
          <Link
            href={`mailto:${CONTACT_EMAIL}`}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-xs text-white/90 transition hover:border-white/40 hover:bg-white/5"
          >
            <Mail className="h-3.5 w-3.5" />
            {CONTACT_EMAIL}
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <SocialLink href="https://instagram.com/" label="Instagram">
            <Instagram className="h-4 w-4" />
          </SocialLink>
          <SocialLink href="https://facebook.com/" label="Facebook">
            <Facebook className="h-4 w-4" />
          </SocialLink>
          <SocialLink href="https://www.linkedin.com/" label="LinkedIn">
            <Linkedin className="h-4 w-4" />
          </SocialLink>
          <span className="ml-2 hidden text-xs text-white/50 md:inline">
            Desarrollado por Digital Amenities
          </span>
        </div>
      </div>
      <p className="border-t border-white/10 px-6 py-2 text-center text-[11px] text-white/50 md:hidden">
        Desarrollado por Digital Amenities
      </p>
    </footer>
  )
}

function SocialLink({
  href,
  label,
  children,
}: {
  href: string
  label: string
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-white/80 transition hover:border-white/40 hover:bg-white/5 hover:text-white"
    >
      {children}
    </a>
  )
}
