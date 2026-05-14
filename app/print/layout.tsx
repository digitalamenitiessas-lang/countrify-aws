// Layout para vistas imprimibles. No hereda el navbar global porque lo neutralizamos aca.
import '@/app/globals.css'

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="print-root bg-white text-black min-h-screen">
      {/* hide global navbar if it leaked from a parent via portals */}
      <style>{`
        @media print {
          header, nav, footer, .glass-card { box-shadow: none !important; }
        }
      `}</style>
      {children}
    </div>
  )
}
