import Link from 'next/link'
import { ArrowRight, CheckCircle2, Database, Scale, ShieldCheck, TrendingUp } from 'lucide-react'
import { MarketingLayout } from '@/components/marketing/MarketingLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const features = [
  { icon: Scale, title: 'Practice operations', body: 'Manage clients, matters, documents, calendars, deadlines, time, invoices, trust accounts, and reports in one tenant-scoped workspace.' },
  { icon: TrendingUp, title: 'Governed revenue lifecycle', body: 'Deduplicate CRM prospects, verify enrichment and consent, assign ownership, require independent approval, and hand engaged prospects to an accountable client record.' },
  { icon: ShieldCheck, title: 'Delivery controls', body: 'Block suppressed or undeliverable recipients, enforce regional consent and firm rate limits, preserve retry state, and retain append-only provider evidence.' },
  { icon: Database, title: 'Operational recovery', body: 'Use explicit migrations, immutable audit chains, production-safe startup, checked backups, and a tested isolated restore procedure.' },
]

export default function HomePage() {
  return <MarketingLayout><main>
    <section className="bg-gradient-to-br from-slate-50 to-blue-50 py-24"><div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
      <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-blue-700">Small-firm practice and revenue operations</p>
      <h1 className="mx-auto max-w-4xl text-5xl font-bold tracking-tight text-slate-950">Move from prospect to client with evidence, ownership, and human approval</h1>
      <p className="mx-auto mt-6 max-w-3xl text-xl text-slate-600">GetFirmFlow combines core legal practice management with a consent-aware revenue workflow. It does not rely on generic generated recommendations for operational decisions.</p>
      <div className="mt-8 flex justify-center gap-3"><Button asChild size="lg"><Link href="/login">Sign in <ArrowRight className="ml-2 h-4 w-4" /></Link></Button><Button asChild size="lg" variant="outline"><Link href="/features">Inspect capabilities</Link></Button></div>
    </div></section>
    <section className="py-20"><div className="mx-auto max-w-6xl px-4 sm:px-6"><div className="grid gap-6 md:grid-cols-2">{features.map((feature) => <Card key={feature.title}><CardHeader><feature.icon className="mb-2 h-7 w-7 text-blue-700" /><CardTitle>{feature.title}</CardTitle></CardHeader><CardContent className="text-slate-600">{feature.body}</CardContent></Card>)}</div></div></section>
    <section className="bg-slate-950 py-16 text-white"><div className="mx-auto grid max-w-5xl gap-6 px-4 md:grid-cols-3">{['Provider provenance is required', 'Approval content is digest-bound', 'Opt-outs persist during outages'].map((item) => <div key={item} className="flex gap-2"><CheckCircle2 className="h-5 w-5 shrink-0 text-green-400" /><span>{item}</span></div>)}</div></section>
  </main></MarketingLayout>
}
