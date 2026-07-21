import { CheckCircle2, CircleSlash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const integrations = [
  { name: 'Revenue CRM', variables: ['REVENUE_CRM_URL', 'REVENUE_CRM_TOKEN'], purpose: 'Bidirectional, deduplicated prospect and account synchronization' },
  { name: 'Enrichment', variables: ['REVENUE_ENRICHMENT_URL', 'REVENUE_ENRICHMENT_TOKEN'], purpose: 'Verified company, region, and provenance evidence' },
  { name: 'Privacy and consent', variables: ['REVENUE_PRIVACY_URL', 'REVENUE_PRIVACY_TOKEN'], purpose: 'Consent, suppression, regional policy, and opt-out propagation' },
  { name: 'Outreach delivery', variables: ['REVENUE_EMAIL_URL', 'REVENUE_EMAIL_TOKEN'], purpose: 'Deliverability preflight, reviewed delivery, and engagement evidence' },
  { name: 'Handoff calendar', variables: ['REVENUE_CALENDAR_URL', 'REVENUE_CALENDAR_TOKEN'], purpose: 'Idempotent consultation event handoff' },
  { name: 'Transactional SMTP', variables: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'], purpose: 'Account recovery, verification, and invoices' },
]

export default function IntegrationsPage() {
  return <div className="space-y-6"><div><h1 className="text-3xl font-bold">Integration readiness</h1><p className="text-muted-foreground">Credentials are injected by the deployment platform and never displayed or stored in the browser.</p></div>
    <div className="grid gap-4 md:grid-cols-2">{integrations.map((integration) => {
      const configured = integration.variables.every((name) => Boolean(process.env[name]?.trim()))
      return <Card key={integration.name}><CardHeader><CardTitle className="flex items-center gap-2">{configured ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <CircleSlash2 className="h-5 w-5 text-amber-600" />}{integration.name}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p>{integration.purpose}</p><p className="text-muted-foreground">{configured ? 'Required runtime values are present.' : `Deployment must provide: ${integration.variables.join(', ')}.`}</p></CardContent></Card>
    })}</div><p className="text-sm text-muted-foreground">Configuration status checks presence only. Provider connectivity is verified when a governed operation is performed and all provider responses require provenance.</p>
  </div>
}
