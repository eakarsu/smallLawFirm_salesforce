import type { Metadata } from 'next'
import { MarketingLayout } from '@/components/marketing/MarketingLayout'

export const metadata: Metadata = { title: 'Security controls', description: 'Implemented GetFirmFlow security and operating controls.' }

const controls = [
  ['Identity', 'JWT sessions require a non-placeholder secret of at least 32 bytes, expire after eight hours, and refresh active firm role state. Passwords use bcrypt cost 12; reset and verification tokens are stored as SHA-256 digests.'],
  ['Authorization', 'Revenue operations enforce tenant identity, active manager checks, assigned-owner transitions, independent review, and cross-origin mutation rejection.'],
  ['Data integrity', 'Revenue prospects use version checks and advisory locks. Delivery evidence and hash-chained audit rows reject database updates and deletes.'],
  ['Outreach safety', 'Fresh privacy evidence, regional explicit consent, suppression, deliverability, authenticated sender domain, content-digest approval, and firm rate limits are required before send.'],
  ['Deployment', 'Runtime startup never installs, builds, migrates, seeds, kills other processes, or continues after invalid configuration. Migration and bootstrap are separate, explicit jobs.'],
  ['Recovery and verification', 'Backups use PostgreSQL custom format, restrictive permissions, checksums, structural verification, and an isolated restore exercise. CI checks migrations twice, failure paths, build, production audit, and repository history for secrets.'],
]

export default function SecurityPage() {
  return <MarketingLayout><main className="mx-auto max-w-4xl px-4 py-20 sm:px-6"><h1 className="text-4xl font-bold">Implemented security controls</h1><p className="mt-4 text-slate-600">No certification, uptime, hosting-region, or cryptographic-at-rest claim is made here. Those require independent deployment evidence outside this repository.</p><dl className="mt-10 space-y-8">{controls.map(([term, description]) => <div key={term} className="border-l-4 border-blue-600 pl-5"><dt className="font-semibold">{term}</dt><dd className="mt-1 text-slate-600">{description}</dd></div>)}</dl></main></MarketingLayout>
}
