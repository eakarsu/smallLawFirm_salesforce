import type { Metadata } from 'next'
import { MarketingLayout } from '@/components/marketing/MarketingLayout'

export const metadata: Metadata = { title: 'Product-use notice', description: 'Operational boundaries for GetFirmFlow deployments.' }

export default function TermsPage() {
  return <MarketingLayout><main className="prose prose-slate mx-auto max-w-4xl px-4 py-20 sm:px-6"><h1>Product-use notice</h1><p>This repository does not define commercial pricing, refunds, an uptime guarantee, governing law, or a binding service agreement. Those terms must be supplied by the organization operating the deployment.</p>
    <h2>Authorized access</h2><p>Public registration is disabled. Users must be provisioned into the correct firm by an authorized administrator and must protect their credentials. Attempts to cross tenant boundaries or bypass workflow controls are prohibited.</p>
    <h2>Professional responsibility</h2><p>The software supports practice and revenue operations but does not provide legal advice. Users remain responsible for legal judgment, professional conduct, client confidentiality, trust-account rules, outreach law, and verification of records.</p>
    <h2>Provider-dependent operations</h2><p>CRM, enrichment, privacy, delivery, calendar, and SMTP operations require separately configured providers. The product fails explicitly when configuration or provider evidence is missing; it does not promise that an external provider will be continuously available.</p>
    <h2>Data and recovery</h2><p>The operator is responsible for access policy, retention, backup custody, tested recovery, provider agreements, incident response, and applicable privacy notices. The included scripts and CI checks are implementation controls, not a certification or service-level commitment.</p>
  </main></MarketingLayout>
}
