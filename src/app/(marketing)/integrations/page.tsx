import type { Metadata } from 'next'
import { MarketingLayout } from '@/components/marketing/MarketingLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata: Metadata = { title: 'Integrations', description: 'External contracts used by GetFirmFlow revenue and transactional workflows.' }

const integrations = [
  ['CRM gateway', 'Pulls bounded prospect batches and pushes versioned prospect/account snapshots with idempotency keys.'],
  ['Enrichment gateway', 'Returns verified region, company data, timestamps, source version, and provider reference.'],
  ['Privacy gateway', 'Evaluates consent, lawful basis, suppression, policy version, and propagates recipient opt-outs.'],
  ['Delivery gateway', 'Performs deliverability preflight, accepts only reviewed content, returns its digest, and exposes engagement status.'],
  ['Calendar gateway', 'Creates an idempotent owner handoff event before CRM account creation.'],
  ['Transactional SMTP', 'Delivers password reset, email verification, and invoice messages over required TLS.'],
]

export default function IntegrationsPage() {
  return <MarketingLayout><main className="mx-auto max-w-5xl px-4 py-20 sm:px-6"><h1 className="text-4xl font-bold">Explicit provider contracts</h1><p className="mt-4 text-lg text-slate-600">Provider base URLs must use HTTPS. Tokens are deployment-injected, never entered into browser forms, and responses without provenance are rejected.</p><div className="mt-10 grid gap-5 md:grid-cols-2">{integrations.map(([name, body]) => <Card key={name}><CardHeader><CardTitle>{name}</CardTitle></CardHeader><CardContent className="text-slate-600">{body}</CardContent></Card>)}</div></main></MarketingLayout>
}
