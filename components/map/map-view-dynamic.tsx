'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

// Dynamically import the MapView component and disable SSR
const DynamicMap = dynamic(() => import('./map-view'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[300px] bg-muted/20 backdrop-blur-sm rounded-xl overflow-hidden flex items-center justify-center p-4 border glass">
      <Skeleton className="w-full h-full opacity-50" />
      <div className="absolute flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" x2="9" y1="3" y2="18"/><line x1="15" x2="15" y1="6" y2="21"/></svg>
        <span className="text-sm font-medium animate-pulse">Cargando mapa...</span>
      </div>
    </div>
  ),
})

export default DynamicMap
