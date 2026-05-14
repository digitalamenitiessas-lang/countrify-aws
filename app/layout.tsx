import type { Metadata, Viewport } from 'next'
import { Montserrat, Montserrat_Alternates } from 'next/font/google'
import { Navbar } from '@/components/navbar'
import { Providers } from '@/components/providers'
import { PwaInit } from '@/components/pwa/pwa-init'
import './globals.css'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
const iconVersion = '20260505'

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-montserrat',
})

const montserratAlternates = Montserrat_Alternates({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-montserrat-alternates',
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eaeaea' },
    { media: '(prefers-color-scheme: dark)', color: '#112250' },
  ],
}

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Countrify | Beneficios exclusivos para countries y barrios cerrados',
    template: '%s | Countrify',
  },
  description:
    'Countrify es la app de beneficios exclusivos para residentes de countries y barrios cerrados: gastronomía, wellness, eventos, reservas y más.',
  applicationName: 'Countrify',
  keywords: [
    'countrify',
    'countries',
    'barrios cerrados',
    'beneficios',
    'descuentos',
    'gastronomía',
    'wellness',
    'eventos',
    'comunidad',
  ],
  authors: [{ name: 'Digital Amenities' }],
  creator: 'Digital Amenities',
  publisher: 'Digital Amenities',
  category: 'technology',
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    url: '/',
    siteName: 'Countrify',
    title: 'Countrify | Beneficios exclusivos para countries y barrios cerrados',
    description:
      'Beneficios exclusivos para residentes de countries y barrios cerrados: gastronomía, wellness, eventos, reservas y experiencias.',
    images: [
      {
        url: '/countrify-logo.svg',
        width: 1200,
        height: 1200,
        alt: 'Countrify',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Countrify | Beneficios exclusivos para countries y barrios cerrados',
    description:
      'Beneficios exclusivos para residentes de countries y barrios cerrados.',
    images: ['/countrify-logo.svg'],
  },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: `/icon.svg?v=${iconVersion}`, type: 'image/svg+xml' },
    ],
    apple: [{ url: `/icon.svg?v=${iconVersion}`, type: 'image/svg+xml' }],
    shortcut: [`/icon.svg?v=${iconVersion}`],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Countrify',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className="dark bg-background" suppressHydrationWarning>
      <body className={`${montserrat.variable} ${montserratAlternates.variable} font-sans antialiased`}>
        <Providers>
          <Navbar />
          {children}
        </Providers>
        <PwaInit />
      </body>
    </html>
  )
}
