import Image from 'next/image'
import { buildPublicS3Url } from '@/lib/aws/s3'
import { getAllBusinessesFromPostgres } from '@/lib/db/businesses'

export async function BrandsCarousel() {
  let businesses: Awaited<ReturnType<typeof getAllBusinessesFromPostgres>> = []
  try {
    businesses = await getAllBusinessesFromPostgres()
  } catch (err) {
    console.error('[BrandsCarousel] error consultando businesses:', err)
    return null
  }

  if (businesses.length === 0) return null

  const items = businesses.map((b) => ({
    id: b.id,
    name: b.name,
    logoUrl: b.logo_path?.startsWith('public/') ? buildPublicS3Url(b.logo_path) : null,
  }))

  // Duplicate enough times so the marquee always looks full, regardless of count.
  const minLoopItems = 8
  const repeats = Math.max(2, Math.ceil(minLoopItems / items.length))
  const loop = Array.from({ length: repeats }, () => items).flat()

  return (
    <section className="relative z-10 w-full border-y border-[#112250]/10 bg-white/60 py-8 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <p className="text-[11px] uppercase tracking-[0.25em] text-[#112250]/60">
          Negocios adheridos
        </p>
        <h2 className="mt-1 font-display text-xl font-semibold text-[#112250] md:text-2xl">
          Marcas que ya forman parte
        </h2>
      </div>

      <div
        className="group relative mt-5 overflow-hidden"
        style={{
          maskImage:
            'linear-gradient(to right, transparent 0, #000 8%, #000 92%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to right, transparent 0, #000 8%, #000 92%, transparent 100%)',
        }}
      >
        <div className="brand-marquee-track flex w-max items-center gap-10 px-6">
          {loop.map((item, i) => (
            <div
              key={`${item.id}-${i}`}
              className="flex h-32 w-56 shrink-0 items-center justify-center rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#112250]/5"
              title={item.name}
            >
              {item.logoUrl ? (
                <Image
                  src={item.logoUrl}
                  alt={item.name}
                  width={200}
                  height={100}
                  className="h-full w-auto object-contain"
                  unoptimized
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#112250]/10 text-xl font-semibold text-[#112250]">
                    {item.name.trim().charAt(0).toUpperCase() || '?'}
                  </span>
                  <span className="line-clamp-1 text-sm font-medium text-[#112250]/80">
                    {item.name}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
