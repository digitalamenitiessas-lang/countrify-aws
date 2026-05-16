import Image from 'next/image'
import { buildPublicS3Url } from '@/lib/aws/s3'
import { getAllBusinessesFromPostgres } from '@/lib/db/businesses'

export async function BrandsCarousel() {
  let businesses: Awaited<ReturnType<typeof getAllBusinessesFromPostgres>> = []
  try {
    businesses = await getAllBusinessesFromPostgres()
  } catch {
    return null
  }

  const withLogos = businesses.filter((b) => b.logo_path?.startsWith('public/'))
  if (withLogos.length === 0) return null

  const items = withLogos.map((b) => ({
    id: b.id,
    name: b.name,
    logoUrl: buildPublicS3Url(b.logo_path as string),
  }))

  const loop = [...items, ...items]

  return (
    <section className="relative z-10 w-full border-y border-[#112250]/10 bg-white/60 py-10 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <p className="text-xs uppercase tracking-[0.25em] text-[#112250]/60">
          Negocios adheridos
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-[#112250] md:text-3xl">
          Marcas que ya forman parte
        </h2>
      </div>

      <div
        className="group relative mt-8 overflow-hidden"
        style={{
          maskImage:
            'linear-gradient(to right, transparent 0, #000 8%, #000 92%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to right, transparent 0, #000 8%, #000 92%, transparent 100%)',
        }}
      >
        <div className="brand-marquee-track flex w-max items-center gap-12 px-6">
          {loop.map((item, i) => (
            <div
              key={`${item.id}-${i}`}
              className="flex h-20 w-40 shrink-0 items-center justify-center rounded-xl bg-white p-4 shadow-sm ring-1 ring-[#112250]/5"
              title={item.name}
            >
              <Image
                src={item.logoUrl}
                alt={item.name}
                width={140}
                height={60}
                className="h-full w-auto object-contain"
                unoptimized
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
