import type { Metadata } from 'next'
import { MarketingLayout } from '@/components/marketing/MarketingLayout'

export const metadata: Metadata = { title: 'Privacy behavior', description: 'Repository-backed GetFirmFlow data handling behavior.' }

export default function PrivacyPage() {
  return <MarketingLayout><main className="prose prose-slate mx-auto max-w-4xl px-4 py-20 sm:px-6"><h1>Privacy behavior</h1><p>This page describes behavior implemented in this repository. The organization operating a deployment must publish its own legal privacy notice, retention schedule, subprocessors, hosting regions, and contact information.</p>
    <h2>Data used by the application</h2><p>Firm users enter client, matter, document, calendar, billing, trust, contact, and prospect data. Authentication uses account identity, password hashes, session claims, and one-time token digests. Operational records include provider references, lifecycle events, and error codes.</p>
    <h2>Revenue providers</h2><p>For the governed revenue workflow, the application sends the minimum workflow fields required by configured CRM, enrichment, privacy, email, and calendar gateways. Provider responses must include provenance. The operator is responsible for contracting with these providers and configuring lawful processing.</p>
    <h2>Outreach and opt-out</h2><p>The application evaluates region, consent, lawful basis, suppression, deliverability, and human approval before outreach. A recipient opt-out is persisted locally even when external propagation is unavailable.</p>
    <h2>Security and retention</h2><p>Passwords use bcrypt and reset/verification tokens are stored as digests. Revenue delivery and audit evidence are append-only at the database layer. General retention and deletion policy is deployment-specific; this repository does not claim a fixed retention period or certification.</p>
    <h2>Requests</h2><p>Data access, correction, export, deletion, or regulatory requests must be directed to the operator of the deployment. No public operator contact is hard-coded.</p>
  </main></MarketingLayout>
}
