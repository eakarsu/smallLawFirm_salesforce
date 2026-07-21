import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'], display: 'swap' })

export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 5, themeColor: '#2563eb' }

export const metadata: Metadata = {
  metadataBase: new URL('https://getfirmflow.com'),
  title: { default: 'GetFirmFlow — Governed Legal Practice Operations', template: '%s | GetFirmFlow' },
  description: 'Legal practice management with tenant-scoped clients, matters, billing, trust accounting, and consent-aware revenue operations.',
  keywords: ['legal practice management', 'law firm CRM', 'legal billing', 'trust accounting', 'client intake', 'revenue operations'],
  robots: { index: true, follow: true },
  openGraph: { type: 'website', url: 'https://getfirmflow.com', siteName: 'GetFirmFlow', title: 'GetFirmFlow — Governed Legal Practice Operations', description: 'Practice management and evidence-backed prospect-to-client workflows.' },
  icons: { icon: [{ url: '/favicon.ico', sizes: 'any' }, { url: '/logo-icon.svg', type: 'image/svg+xml' }], shortcut: '/favicon.ico' },
  manifest: '/manifest.json',
}

const jsonLd = {
  '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'GetFirmFlow', url: 'https://getfirmflow.com',
  applicationCategory: 'BusinessApplication', operatingSystem: 'Web Browser',
  description: 'Legal practice management and governed revenue operations for small law firms.',
  featureList: ['Client and matter management', 'Time, invoicing, and trust accounting', 'Calendar and deadline management', 'Consent-aware revenue operations', 'Immutable revenue evidence'],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><head><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} /></head><body className={inter.className}><Providers>{children}</Providers></body></html>
}
