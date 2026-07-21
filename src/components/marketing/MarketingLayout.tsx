"use client"

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LogoInline } from '@/components/ui/logo'

const links = [
  { href: '/features', label: 'Features' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/security', label: 'Security' },
  { href: '/contact', label: 'Access' },
]

export function MarketingHeader() {
  const [open, setOpen] = useState(false)
  return <nav className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
    <Link href="/" aria-label="GetFirmFlow home"><LogoInline /></Link>
    <div className="hidden items-center gap-7 lg:flex">{links.map((link) => <Link key={link.href} href={link.href} className="text-sm text-slate-600 hover:text-slate-950">{link.label}</Link>)}<Button asChild><Link href="/login">Sign in</Link></Button></div>
    <Button className="lg:hidden" variant="ghost" size="icon" aria-label="Toggle navigation" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</Button>
  </div>{open && <div className="space-y-2 border-t bg-white p-4 lg:hidden">{links.map((link) => <Link key={link.href} href={link.href} className="block py-2" onClick={() => setOpen(false)}>{link.label}</Link>)}<Button asChild className="w-full"><Link href="/login">Sign in</Link></Button></div>}</nav>
}

export function MarketingFooter() {
  return <footer className="bg-slate-950 py-10 text-slate-300"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 px-4 sm:flex-row sm:px-6 lg:px-8">
    <div><LogoInline variant="dark" /><p className="mt-3 max-w-md text-sm">Practice management and governed revenue operations for small law firms. Capabilities shown on this site correspond to checked-in product workflows.</p></div>
    <div className="flex flex-wrap gap-5 text-sm"><Link href="/features">Features</Link><Link href="/integrations">Integrations</Link><Link href="/security">Security</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>
  </div><p className="mx-auto mt-8 max-w-7xl px-4 text-xs text-slate-500 sm:px-6 lg:px-8">© {new Date().getFullYear()} GetFirmFlow.</p></footer>
}

export function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white"><MarketingHeader />{children}<MarketingFooter /></div>
}
