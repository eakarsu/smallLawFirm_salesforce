"use client"

import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type Summary = {
  id: string; normalizedEmail: string; givenName: string; familyName: string; company: string; region: string
  lifecycle: string; ownerId: string | null; source: string; qualityScore: number; retryAt: string | null; syncStatus: string; updatedAt: string
}
type Detail = Summary & { review?: Record<string, unknown>; privacy?: Record<string, unknown>; deliverability?: Record<string, unknown>; audit?: Array<Record<string, unknown>> }
type User = { id: string; firstName: string; lastName: string; role: string }
type Metrics = { total: number; delivered: number; suppressed: number; duplicatesMerged: number; conversion: Record<string, number>; dataQuality: { averageScore: number; belowThreshold: number } }

const field = "rounded-md border border-input bg-background px-3 py-2 text-sm"

export default function RevenueOperationsPage() {
  const { data: session } = useSession()
  const manager = session?.user && ["ADMIN", "PARTNER"].includes(session.user.role)
  const [prospects, setProspects] = useState<Summary[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [selected, setSelected] = useState<Detail | null>(null)
  const [message, setMessage] = useState("")
  const [failure, setFailure] = useState("")
  const [busy, setBusy] = useState(false)
  const [ownerId, setOwnerId] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [notes, setNotes] = useState("")
  const [startsAt, setStartsAt] = useState("")
  const [form, setForm] = useState({ email: "", givenName: "", familyName: "", company: "", region: "US", source: "MANUAL" })

  const request = useCallback(async (url: string, options?: RequestInit) => {
    const response = await fetch(url, { cache: "no-store", ...options, headers: { "content-type": "application/json", ...options?.headers } })
    const value = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(value.error || "Operation failed")
    return value
  }, [])

  const load = useCallback(async () => {
    try {
      const value = await request("/api/revenue-operations")
      setProspects(value.prospects); setMetrics(value.metrics); setFailure("")
      if (selected) setSelected(await request(`/api/revenue-operations/${selected.id}`))
    } catch (error) { setFailure(error instanceof Error ? error.message : "Unable to load revenue operations") }
  }, [request, selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!manager) return
    void request("/api/settings/users").then(setUsers).catch(() => setUsers([]))
  }, [manager, request])

  async function select(id: string) {
    try { setSelected(await request(`/api/revenue-operations/${id}`)); setFailure("") }
    catch (error) { setFailure(error instanceof Error ? error.message : "Unable to load prospect") }
  }

  async function action(payload: Record<string, unknown>, success: string) {
    if (!selected) return
    setBusy(true); setFailure(""); setMessage("")
    try {
      const next = await request(`/api/revenue-operations/${selected.id}/actions`, { method: "POST", body: JSON.stringify(payload) })
      setSelected(next); setMessage(success); await load()
    } catch (error) { setFailure(error instanceof Error ? error.message : "Operation failed") }
    finally { setBusy(false) }
  }

  async function createProspect(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setFailure("")
    try {
      const created = await request("/api/revenue-operations", { method: "POST", body: JSON.stringify(form) })
      setForm({ email: "", givenName: "", familyName: "", company: "", region: "US", source: "MANUAL" })
      setSelected(created); setMessage("Prospect created with an immutable audit record."); await load()
    } catch (error) { setFailure(error instanceof Error ? error.message : "Creation failed") }
    finally { setBusy(false) }
  }

  async function inboundSync() {
    setBusy(true); setFailure("")
    try { const result = await request("/api/revenue-operations/sync", { method: "POST", body: "{}" }); setMessage(`CRM sync: ${result.created} created, ${result.merged} merged, ${result.deduplicated} duplicate records.`); await load() }
    catch (error) { setFailure(error instanceof Error ? error.message : "CRM sync failed") }
    finally { setBusy(false) }
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-3xl font-bold">Revenue operations</h1><p className="text-muted-foreground">Consent-aware prospecting, independent review, provider evidence, and accountable client handoff.</p></div>
      {manager && <Button onClick={inboundSync} disabled={busy}><RefreshCw className="mr-2 h-4 w-4" />Sync CRM inbound</Button>}
    </div>

    {failure && <div role="alert" className="flex gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"><AlertTriangle className="h-5 w-5 shrink-0" />{failure}</div>}
    {message && <div role="status" className="flex gap-2 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800"><CheckCircle2 className="h-5 w-5 shrink-0" />{message}</div>}

    {metrics && <div className="grid gap-4 md:grid-cols-4">
      <Metric label="Prospects" value={metrics.total} /><Metric label="Outreach sent" value={metrics.delivered} /><Metric label="Suppressed" value={metrics.suppressed} /><Metric label="Average quality" value={`${metrics.dataQuality.averageScore}%`} />
    </div>}

    {manager && <Card><CardHeader><CardTitle>Create governed prospect</CardTitle></CardHeader><CardContent>
      <form onSubmit={createProspect} className="grid gap-3 md:grid-cols-3">
        <Input aria-label="Prospect email" type="email" required placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input aria-label="First name" required placeholder="First name" value={form.givenName} onChange={(e) => setForm({ ...form, givenName: e.target.value })} />
        <Input aria-label="Last name" required placeholder="Last name" value={form.familyName} onChange={(e) => setForm({ ...form, familyName: e.target.value })} />
        <Input aria-label="Company" required placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        <Input aria-label="Region" required placeholder="Region (US, UK, CA, EEA)" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value.toUpperCase() })} />
        <div className="flex gap-2"><Input aria-label="Attribution source" required placeholder="Attribution source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /><Button disabled={busy}>Create</Button></div>
      </form>
    </CardContent></Card>}

    <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.8fr)_minmax(520px,1.2fr)]">
      <Card><CardHeader><CardTitle>Prospect queue</CardTitle></CardHeader><CardContent className="space-y-2">
        {prospects.length === 0 && <p className="text-sm text-muted-foreground">No governed prospects are visible to you.</p>}
        {prospects.map((prospect) => <button key={prospect.id} onClick={() => void select(prospect.id)} className={`w-full rounded-md border p-3 text-left hover:bg-slate-50 ${selected?.id === prospect.id ? "border-primary bg-slate-50" : ""}`}>
          <div className="flex items-center justify-between gap-2"><span className="font-medium">{prospect.company || `${prospect.givenName} ${prospect.familyName}`}</span><Lifecycle value={prospect.lifecycle} /></div>
          <p className="text-sm text-muted-foreground">{prospect.normalizedEmail} · {prospect.region} · quality {prospect.qualityScore}%</p>
          {prospect.retryAt && <p className="mt-1 text-xs text-amber-700">Retry after {new Date(prospect.retryAt).toLocaleString()}</p>}
        </button>)}
      </CardContent></Card>

      <Card><CardHeader><CardTitle>{selected ? selected.company || selected.normalizedEmail : "Workflow details"}</CardTitle></CardHeader><CardContent className="space-y-5">
        {!selected && <p className="text-sm text-muted-foreground">Select a prospect to inspect evidence and perform an authorized transition.</p>}
        {selected && <>
          <div className="grid gap-2 rounded-md bg-slate-50 p-3 text-sm md:grid-cols-3"><span>State: <b>{selected.lifecycle}</b></span><span>Quality: <b>{selected.qualityScore}%</b></span><span>CRM: <b>{selected.syncStatus}</b></span></div>

          {manager && <section className="space-y-2"><h2 className="font-semibold">Ownership</h2><div className="flex gap-2"><select aria-label="Owner" className={`${field} flex-1`} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}><option value="">Select active firm user</option>{users.map((user) => <option key={user.id} value={user.id}>{user.firstName} {user.lastName} ({user.role})</option>)}</select><Button disabled={busy || !ownerId} onClick={() => void action({ action: "assign_owner", ownerId }, "Owner assigned.")}>Assign</Button></div></section>}

          <section className="space-y-2"><h2 className="font-semibold">Qualification and human review</h2><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => void action({ action: "enrich" }, "Enrichment evidence recorded.")}>Verify enrichment</Button></div>
            <Input aria-label="Outreach subject" placeholder="Reviewed outreach subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <textarea aria-label="Outreach body" className={`${field} min-h-28 w-full`} placeholder="Write the exact message that a different manager must approve" value={body} onChange={(e) => setBody(e.target.value)} />
            <Button disabled={busy || !subject || !body} onClick={() => void action({ action: "prepare_review", subject, body }, "Consent, deliverability, quality, and content manifest submitted for review.")}><ShieldCheck className="mr-2 h-4 w-4" />Prepare independent review</Button>
            {manager && <div className="space-y-2 rounded-md border p-3"><Input aria-label="Review notes" placeholder="Required independent review notes" value={notes} onChange={(e) => setNotes(e.target.value)} /><div className="flex gap-2"><Button disabled={busy || !notes} onClick={() => void action({ action: "review", decision: "APPROVE", notes }, "Outreach approved with content manifest.")}>Approve</Button><Button variant="destructive" disabled={busy || !notes} onClick={() => void action({ action: "review", decision: "REJECT", notes }, "Outreach rejected.")}>Reject</Button></div></div>}
          </section>

          <section className="space-y-2"><h2 className="font-semibold">Delivery, engagement, and handoff</h2><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void action({ action: "send_outreach" }, "Outreach delivery transition processed.")}>Send approved outreach</Button><Button variant="outline" disabled={busy} onClick={() => void action({ action: "verify_engagement" }, "Recipient engagement verified.")}>Verify reply</Button><Button variant="outline" disabled={busy} onClick={() => void action({ action: "sync_outbound" }, "CRM outbound state processed.")}>Sync CRM outbound</Button></div>
            <div className="flex flex-wrap gap-2"><Input aria-label="Handoff time" className="max-w-xs" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /><Button disabled={busy || !startsAt} onClick={() => void action({ action: "handoff", startsAt: new Date(startsAt).toISOString() }, "Calendar and CRM account handoff processed.")}>Create handoff</Button><Button variant="destructive" disabled={busy} onClick={() => void action({ action: "opt_out", reason: "Recipient opt-out recorded by user" }, "Local suppression recorded and provider propagation attempted.")}>Record opt-out</Button></div>
          </section>

          <section><h2 className="mb-2 font-semibold">Immutable audit trail</h2><div className="max-h-52 space-y-2 overflow-auto">{selected.audit?.map((event) => <div key={String(event.eventHash)} className="rounded border p-2 text-xs"><b>#{String(event.sequence)} {String(event.action)}</b><div className="text-muted-foreground">Actor {String(event.actorId)} · hash {String(event.eventHash).slice(0, 16)}…</div></div>)}</div></section>
        </>}
      </CardContent></Card>
    </div>
  </div>
}

function Metric({ label, value }: { label: string; value: string | number }) { return <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></CardContent></Card> }
function Lifecycle({ value }: { value: string }) { return <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-medium">{value.replaceAll("_", " ")}</span> }
