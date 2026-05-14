import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { getCurrentProfile } from '@/lib/auth'
import { ROLE_HOME } from '@/lib/constants'
import { isSupabaseConfigured } from '@/lib/supabase/env'

export default async function HomePage() {
  if (isSupabaseConfigured()) {
    const profile = await getCurrentProfile()
    if (profile?.role) {
      redirect(ROLE_HOME[profile.role])
    }
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

      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-4xl flex-col items-center justify-center px-6 py-16 text-center">
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
        </div>

        <p className="mt-16 text-xs text-[#3b507d]/70">Powered by Digital Amenities</p>
      </div>
    </main>
  )
}
