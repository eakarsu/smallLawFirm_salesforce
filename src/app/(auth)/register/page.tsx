import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function RegistrationPage() {
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
    <Card className="max-w-lg"><CardHeader><CardTitle>Account provisioning is controlled</CardTitle></CardHeader><CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Public self-registration is disabled so a new user cannot choose a privileged role or enter another firm. Ask an authorized firm administrator to provision and verify your account.</p>
      <div className="flex gap-2"><Button asChild><Link href="/login">Return to sign in</Link></Button><Button asChild variant="outline"><Link href="/contact">Contact us</Link></Button></div>
    </CardContent></Card>
  </main>
}
