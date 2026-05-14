'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { PromotionCard } from '@/components/promotion-card'
import { CATEGORIES } from '@/lib/constants'
import type { Promotion } from '@/lib/types'

export function PromotionsBrowser({ promotions }: { promotions: Promotion[] }) {
  const [selectedCategory, setSelectedCategory] = useState('Todas')
  const [search, setSearch] = useState('')

  const categories = useMemo(() => {
    const values = new Set<string>(CATEGORIES)
    promotions.forEach((promotion) => values.add(promotion.category))
    return ['Todas', ...Array.from(values).filter((category) => category !== 'Todas')]
  }, [promotions])

  const filtered = useMemo(() => {
    return promotions.filter((promotion) => {
      const matchCategory = selectedCategory === 'Todas' || promotion.category === selectedCategory
      const query = search.trim().toLowerCase()
      const matchSearch =
        !query ||
        promotion.title.toLowerCase().includes(query) ||
        promotion.businessName.toLowerCase().includes(query) ||
        promotion.description.toLowerCase().includes(query)
      return matchCategory && matchSearch
    })
  }, [promotions, search, selectedCategory])

  return (
    <div className="min-h-screen bg-background pt-16">
      <section className="pt-24 pb-10 px-6 border-b border-border/50 bg-grid">
        <div className="max-w-6xl mx-auto">
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-2 text-balance">
            Mercado de Promociones
          </h1>
          <p className="text-muted-foreground mb-8">
            Beneficios reales para residentes y comercios de Countrify, servidos desde la infraestructura actual de la plataforma.
          </p>

          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar promociones..." value={search} onChange={(event) => setSearch(event.target.value)} className="pl-10 bg-input/50 border-border/50" />
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-wrap gap-2 mb-8">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                selectedCategory === category
                  ? 'text-white border border-primary/50'
                  : 'text-muted-foreground border border-border/50 hover:border-primary/30 hover:text-foreground'
              }`}
              style={selectedCategory === category ? { background: 'linear-gradient(135deg, #112250, #0a1838)' } : { background: 'rgba(17, 34, 80,0.05)' }}
            >
              {category}
            </button>
          ))}
        </div>

        <p className="text-sm text-muted-foreground mb-6">
          {filtered.length} {filtered.length === 1 ? 'promocion encontrada' : 'promociones encontradas'}
        </p>

        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((promotion) => (
              <PromotionCard key={promotion.id} promotion={promotion} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 glass-card rounded-2xl">
            <p className="text-muted-foreground">No se encontraron promociones. Proba con otra busqueda o categoria.</p>
          </div>
        )}
      </div>
    </div>
  )
}
