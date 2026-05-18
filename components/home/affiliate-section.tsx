'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ContactDialog, type ContactKind } from '@/components/home/contact-dialog'

const CONTACT_EMAIL = 'digitalamenitiessas@gmail.com'

export function AffiliateSection() {
  const [openKind, setOpenKind] = useState<ContactKind | null>(null)

  return (
    <section className="relative z-10 mx-auto w-full max-w-5xl px-6 py-20">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.25em] text-[#112250]/60">
          Sumate a la red
        </p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-[#112250] md:text-4xl">
          Quiero afiliarme
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-[#3b507d] md:text-base">
          Si sos administrador/a de un country o tenés un negocio que quiere
          llegar a miles de residentes, escribinos y armamos el alta juntos.
        </p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <article className="flex flex-col rounded-2xl bg-white p-8 shadow-sm ring-1 ring-[#112250]/10">
          <div className="text-3xl">🏡</div>
          <h3 className="mt-3 font-display text-xl font-semibold text-[#112250]">
            Soy un country
          </h3>
          <p className="mt-2 flex-1 text-sm text-[#3b507d]">
            Llevá Countrify a tu barrio cerrado: beneficios exclusivos para
            residentes, panel para la administración y comunicación directa con
            los vecinos.
          </p>
          <Button
            size="lg"
            className="mt-6 bg-[#112250] text-white hover:bg-[#3b507d]"
            onClick={() => setOpenKind('country')}
          >
            Contactar para sumar mi country
          </Button>
        </article>

        <article className="flex flex-col rounded-2xl bg-white p-8 shadow-sm ring-1 ring-[#112250]/10">
          <div className="text-3xl">🛍️</div>
          <h3 className="mt-3 font-display text-xl font-semibold text-[#112250]">
            Soy un negocio
          </h3>
          <p className="mt-2 flex-1 text-sm text-[#3b507d]">
            Llegá a residentes de countries y barrios cerrados con promociones,
            descuentos y experiencias. Te acompañamos en el alta y la gestión.
          </p>
          <Button
            size="lg"
            variant="outline"
            className="mt-6 border-[#112250] text-[#112250] hover:bg-[#f4dcb3]/40"
            onClick={() => setOpenKind('business')}
          >
            Quiero adherir mi negocio
          </Button>
        </article>
      </div>

      <p className="mt-10 text-center text-sm text-[#3b507d]/80">
        O escribinos directo a{' '}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="font-medium text-[#112250] underline-offset-4 hover:underline"
        >
          {CONTACT_EMAIL}
        </a>
      </p>

      <ContactDialog
        open={openKind !== null}
        onOpenChange={(open) => !open && setOpenKind(null)}
        kind={openKind ?? 'business'}
      />
    </section>
  )
}
