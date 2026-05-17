import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { AffiliateSection } from '@/components/home/affiliate-section'
import { BrandsCarousel } from '@/components/home/brands-carousel'
import { SiteFooter } from '@/components/home/site-footer'
import { getCurrentProfile } from '@/lib/auth'
import { ROLE_HOME } from '@/lib/constants'

export default async function HomePage() {
  const profile = await getCurrentProfile()
  if (profile?.role) {
    redirect(ROLE_HOME[profile.role])
  }

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#eaeaea] text-[#112250]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(circle at 20% 10%, rgba(17,34,80,0.08), transparent 55%),' +
            'radial-gradient(circle at 80% 90%, rgba(244,220,179,0.45), transparent 55%)',
        }}
      />

      <section className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-6 pb-16 pt-20 text-center md:pt-28">
        <Image
          src="/countrify-logo.svg"
          alt="Countrify"
          width={220}
          height={220}
          priority
          className="mb-10"
        />

        <h1 className="font-display text-4xl font-semibold tracking-tight md:text-5xl">
          Beneficios exclusivos para tu country
        </h1>

        <p className="mt-5 max-w-xl text-base text-[#3b507d] md:text-lg">
          Descuentos en gastronomía, wellness, eventos y experiencias diseñadas
          para residentes de countries y barrios cerrados.
        </p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="bg-[#112250] text-white hover:bg-[#3b507d]">
            <Link href="/login">Ingresar</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-[#112250] text-[#112250] hover:bg-[#f4dcb3]/40">
            <Link href="/promotions">Ver promociones</Link>
          </Button>
          <Button asChild size="lg" variant="ghost" className="text-[#112250] hover:bg-[#112250]/5">
            <Link href="#afiliarme">Quiero afiliarme</Link>
          </Button>
        </div>
      </section>

      <BrandsCarousel />

      <div id="afiliarme">
        <AffiliateSection />
      </div>

      <SiteFooter />
    </main>
  )
}
