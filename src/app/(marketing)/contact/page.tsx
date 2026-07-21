import { Mail } from 'lucide-react'
import { MarketingLayout } from '@/components/marketing/MarketingLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ContactPage() {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim()
  return <MarketingLayout><main className="mx-auto max-w-3xl px-4 py-20 sm:px-6"><h1 className="text-4xl font-bold">Account access</h1><p className="mt-4 text-lg text-slate-600">Public self-registration is disabled. This prevents an unauthenticated user from selecting a privileged role or joining an unrelated firm.</p><Card className="mt-10"><CardHeader><CardTitle>Request an account</CardTitle></CardHeader><CardContent className="space-y-3 text-slate-600"><p>Ask an active administrator in your firm to provision the account from User Management. The administrator chooses the firm and role, and the user must verify their email.</p>{supportEmail ? <a className="inline-flex items-center gap-2 text-blue-700 underline" href={`mailto:${supportEmail}`}><Mail className="h-4 w-4" />Contact deployment support</a> : <p className="text-sm">No public support address is configured. Contact the operator of this deployment.</p>}</CardContent></Card></main></MarketingLayout>
}
