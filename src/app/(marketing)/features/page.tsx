import type { Metadata } from 'next'
import { MarketingLayout } from '@/components/marketing/MarketingLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata: Metadata = { title: 'Features', description: 'Checked-in GetFirmFlow practice and revenue workflows.' }

const groups = [
  { title: 'Practice management', items: ['Clients and contacts', 'Matters and assignments', 'Documents and version history', 'Calendars and deadlines', 'Time entries and expenses', 'Invoices and payments', 'Trust ledgers and reconciliation', 'Operational reports'] },
  { title: 'Revenue operations', items: ['Manual and CRM prospect intake', 'Firm-scoped identity deduplication', 'Attribution touch history', 'Owner assignment', 'Enrichment provenance', 'Regional consent and suppression evaluation', 'Deliverability and sender-domain preflight', 'Independent human content review', 'Rate-limited delivery with retry state', 'Verified reply evidence', 'Calendar and CRM account handoff', 'Conversion and quality metrics'] },
  { title: 'Operational controls', items: ['Active-user and tenant authorization', 'Optimistic concurrency with database advisory locks', 'Append-only delivery and audit evidence', 'Hashed one-time authentication tokens', 'Fail-closed configuration', 'Explicit release migrations', 'Custom-format backup checksum and restore runbook', 'Unit, integration, E2E, startup, build, audit, and secret checks in CI'] },
]

export default function FeaturesPage() {
  return <MarketingLayout><main className="mx-auto max-w-6xl px-4 py-20 sm:px-6"><h1 className="text-4xl font-bold">Implemented capabilities</h1><p className="mt-4 max-w-3xl text-lg text-slate-600">This list intentionally describes product paths backed by checked-in persistence, permissions, and tests. Features requiring an external provider fail with an explicit configuration or provider error.</p><div className="mt-10 grid gap-6 lg:grid-cols-3">{groups.map((group) => <Card key={group.title}><CardHeader><CardTitle>{group.title}</CardTitle></CardHeader><CardContent><ul className="list-disc space-y-2 pl-5 text-sm text-slate-600">{group.items.map((item) => <li key={item}>{item}</li>)}</ul></CardContent></Card>)}</div></main></MarketingLayout>
}
