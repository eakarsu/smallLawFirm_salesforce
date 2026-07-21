import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canonicalRevenue, MemoryRevenueRepository, RevenueOperationsWorkflow, RevenueWorkflowError, revenueHash,
  type RevenueActor, type RevenueProviders,
} from '../../src/lib/revenue-operations-workflow'

const admin: RevenueActor = { userId: 'admin-1', firmId: 'firm-1', role: 'ADMIN' }
const reviewer: RevenueActor = { userId: 'partner-2', firmId: 'firm-1', role: 'PARTNER' }
const owner: RevenueActor = { userId: 'attorney-1', firmId: 'firm-1', role: 'ATTORNEY' }

function fixture(limit = 100) {
  let now = new Date('2026-07-20T12:00:00.000Z')
  let privacyCalls = 0
  let sendFailure: Error | null = null
  let crmFailure: Error | null = null
  let calendarFailure: Error | null = null
  let optOutFailure: Error | null = null
  let privacy = { email: '', region: '', consentStatus: 'NOT_REQUIRED', lawfulBasis: 'LEGITIMATE_INTEREST', suppressed: false, policyVersion: 'v1' }
  let preflight = { status: 'DELIVERABLE', score: 0.98, authenticatedDomain: true }
  const sentKeys: string[] = []
  const crmPushKeys: string[] = []
  const providers: RevenueProviders = {
    crm: {
      pull: async () => ({ provider: 'crm-test', reference: 'pull-1', nextCursor: 'cursor-2', records: [] }),
      push: async (value) => {
        crmPushKeys.push(String(value.idempotencyKey))
        if (crmFailure) { const failure = crmFailure; crmFailure = null; throw failure }
        return value.operation === 'UPSERT_ACCOUNT'
          ? { provider: 'crm-test', reference: 'account-1', externalAccountId: 'account-external-1' }
          : { provider: 'crm-test', reference: 'prospect-1', externalId: 'prospect-external-1', externalVersion: '7' }
      },
    },
    enrichment: { lookup: async () => ({ provider: 'enrichment-test', reference: 'enrich-1', verifiedAt: new Date(now.getTime() - 1_000).toISOString(), region: 'US', company: 'Acme Law Leads', companyDomain: 'acme.example', sourceVersion: '2026-07' }) },
    privacy: {
      evaluate: async (value) => ({ provider: 'privacy-test', reference: `privacy-${++privacyCalls}`, checkedAt: new Date(now.getTime() - 1_000).toISOString(), ...privacy, email: value.email, region: value.region }),
      recordOptOut: async () => { if (optOutFailure) throw optOutFailure; return { provider: 'privacy-test', reference: 'optout-1', occurredAt: now.toISOString() } },
    },
    email: {
      preflight: async (value) => ({ provider: 'email-test', reference: 'preflight-1', email: value.email, checkedAt: new Date(now.getTime() - 1_000).toISOString(), ...preflight }),
      send: async (value) => {
        sentKeys.push(String(value.idempotencyKey))
        if (sendFailure) { const failure = sendFailure; sendFailure = null; throw failure }
        return { provider: 'email-test', reference: 'message-1', acceptedAt: now.toISOString(), contentHash: revenueHash(canonicalRevenue({ subject: value.subject, body: value.body })) }
      },
      status: async (value) => ({ provider: 'email-test', reference: value.reference, status: 'REPLIED', messageHash: revenueHash('verified-reply'), occurredAt: now.toISOString() }),
    },
    calendar: { upsert: async () => { if (calendarFailure) { const failure = calendarFailure; calendarFailure = null; throw failure }; return { provider: 'calendar-test', reference: 'event-1' } } },
  }
  const repository = new MemoryRevenueRepository()
  const workflow = new RevenueOperationsWorkflow(repository, providers, () => new Date(now), limit)
  return {
    workflow, repository, providers, sentKeys, crmPushKeys,
    advance(ms: number) { now = new Date(now.getTime() + ms) },
    setPrivacy(value: Partial<typeof privacy>) { privacy = { ...privacy, ...value } },
    setPreflight(value: Partial<typeof preflight>) { preflight = { ...preflight, ...value } },
    failSend(error = Object.assign(new Error('email unavailable'), { code: 'EMAIL_503', retryAfterSeconds: 60 })) { sendFailure = error },
    failCrm(error = Object.assign(new Error('crm unavailable'), { code: 'CRM_503' })) { crmFailure = error },
    failCalendar(error = Object.assign(new Error('calendar unavailable'), { code: 'CALENDAR_503' })) { calendarFailure = error },
    failOptOut(error = Object.assign(new Error('privacy unavailable'), { code: 'PRIVACY_503' })) { optOutFailure = error },
  }
}

async function qualified(value = fixture()) {
  const created = await value.workflow.createManual(admin, { email: 'lead@example.com', givenName: 'Leah', familyName: 'Davis', company: 'Acme', region: 'US', source: 'REFERRAL' })
  await value.workflow.assignOwner(admin, created.id, owner.userId)
  const enriched = await value.workflow.enrich(owner, created.id)
  return { ...value, id: enriched.id }
}

async function approved(value = fixture()) {
  const result = await qualified(value)
  await result.workflow.prepareReview(owner, result.id, 'A reviewed subject', 'A reviewed message body')
  await result.workflow.review(reviewer, result.id, 'APPROVE', 'Consent, content, and audience verified')
  return result
}

async function assertCode(action: () => Promise<unknown>, code: string) {
  await assert.rejects(action, (error: unknown) => error instanceof RevenueWorkflowError && error.code === code)
}

test('manual creation rejects a duplicate firm email identity', async () => {
  const value = fixture()
  await value.workflow.createManual(admin, { email: 'LEAD@example.com', givenName: 'A', familyName: 'B', company: 'C', region: 'US', source: 'WEB' })
  await assertCode(() => value.workflow.createManual(admin, { email: 'lead@example.com', givenName: 'D', familyName: 'E', company: 'F', region: 'US', source: 'EVENT' }), 'DUPLICATE_PROSPECT')
})

test('CRM inbound sync deduplicates a batch and preserves attribution touches', async () => {
  const value = fixture()
  value.providers.crm.pull = async () => ({ provider: 'crm-test', reference: 'pull-2', nextCursor: 'next', records: [
    { externalId: 'crm-1', email: 'same@example.com', givenName: 'Sam', familyName: 'Lee', company: 'Acme', region: 'US', source: 'WEB', campaign: 'spring' },
    { externalId: 'crm-1', email: 'SAME@example.com', givenName: 'Samuel', familyName: 'Lee', company: 'Acme', region: 'US', source: 'EVENT', campaign: 'summer' },
  ] })
  const result = await value.workflow.syncInbound(admin)
  assert.deepEqual({ created: result.created, merged: result.merged, deduplicated: result.deduplicated }, { created: 1, merged: 1, deduplicated: 1 })
  assert.equal((await value.workflow.view(admin, result.prospects[0].id)).attribution.touches.length, 2)
})

test('only the assigned owner can enrich or operate a prospect', async () => {
  const value = fixture()
  const created = await value.workflow.createManual(admin, { email: 'lead@example.com', givenName: 'A', familyName: 'B', company: 'C', region: 'US', source: 'WEB' })
  await value.workflow.assignOwner(admin, created.id, owner.userId)
  await assertCode(() => value.workflow.enrich({ ...owner, userId: 'attorney-2' }, created.id), 'PROSPECT_NOT_FOUND')
})

test('regional policy blocks EEA outreach without explicit consent', async () => {
  const value = fixture(); value.setPrivacy({ consentStatus: 'NOT_REQUIRED', lawfulBasis: 'LEGITIMATE_INTEREST' })
  const created = await value.workflow.createManual(admin, { email: 'lead@example.com', givenName: 'A', familyName: 'B', company: 'C', region: 'EEA', source: 'WEB' })
  await value.workflow.assignOwner(admin, created.id, owner.userId)
  value.providers.enrichment.lookup = async () => ({ provider: 'enrichment-test', reference: 'e-1', verifiedAt: '2026-07-20T11:59:00.000Z', region: 'EEA', company: 'C' })
  await value.workflow.enrich(owner, created.id)
  await assertCode(() => value.workflow.prepareReview(owner, created.id, 'Subject', 'Body'), 'EXPLICIT_CONSENT_REQUIRED')
})

test('deliverability and authenticated-domain evidence are mandatory', async () => {
  const value = await qualified(); value.setPreflight({ score: 0.4, authenticatedDomain: false })
  await assertCode(() => value.workflow.prepareReview(owner, value.id, 'Subject', 'Body'), 'DELIVERABILITY_BLOCKED')
})

test('stale or mismatched deliverability evidence cannot enter human review', async () => {
  const value = await qualified()
  value.providers.email.preflight = async () => ({ provider: 'email-test', reference: 'old-check', email: 'other@example.com', checkedAt: '2026-07-20T10:00:00.000Z', status: 'DELIVERABLE', score: 1, authenticatedDomain: true })
  await assertCode(() => value.workflow.prepareReview(owner, value.id, 'Subject', 'Body'), 'DELIVERABILITY_EVIDENCE_INVALID')
})

test('review must be performed by an independent active manager', async () => {
  const value = await qualified()
  await value.workflow.prepareReview(owner, value.id, 'Subject', 'Body')
  await assertCode(() => value.workflow.review({ ...admin, userId: owner.userId }, value.id, 'APPROVE', 'Looks good'), 'INDEPENDENT_REVIEW_REQUIRED')
  assert.equal((await value.workflow.review(reviewer, value.id, 'APPROVE', 'Reviewed independently')).lifecycle, 'APPROVED')
})

test('approved outreach, verified reply, and provider handoff complete with a valid audit hash chain', async () => {
  const value = await approved()
  assert.equal((await value.workflow.sendOutreach(owner, value.id)).lifecycle, 'OUTREACH_SENT')
  assert.equal((await value.workflow.verifyEngagement(owner, value.id)).lifecycle, 'ENGAGED')
  value.advance(1_000)
  assert.equal((await value.workflow.handoff(owner, value.id, '2026-07-21T12:00:00.000Z')).lifecycle, 'HANDED_OFF')
  const audit = (await value.workflow.view(owner, value.id)).audit!
  assert.ok(audit.length >= 8)
  for (let index = 0; index < audit.length; index += 1) {
    assert.equal(audit[index].previousHash, index ? audit[index - 1].eventHash : 'GENESIS')
    const { createdAt: _createdAt, eventHash: _eventHash, ...body } = audit[index]
    assert.equal(audit[index].eventHash, revenueHash(canonicalRevenue(body)))
  }
})

test('delivery failure persists retry state and reuses the same idempotency key', async () => {
  const value = await approved(); value.failSend()
  const failed = await value.workflow.sendOutreach(owner, value.id)
  assert.equal(failed.lifecycle, 'RETRY_WAIT')
  await assertCode(() => value.workflow.sendOutreach(owner, value.id), 'RETRY_NOT_DUE')
  value.advance(60_000)
  assert.equal((await value.workflow.sendOutreach(owner, value.id)).lifecycle, 'OUTREACH_SENT')
  assert.equal(value.sentKeys[0], value.sentKeys[1])
})

test('firm delivery rate limits are enforced before provider submission', async () => {
  const value = fixture(1); const first = await approved(value)
  await first.workflow.sendOutreach(owner, first.id)
  const secondCreated = await first.workflow.createManual(admin, { email: 'second@example.com', givenName: 'Second', familyName: 'Lead', company: 'Other', region: 'US', source: 'WEB' })
  await first.workflow.assignOwner(admin, secondCreated.id, owner.userId); await first.workflow.enrich(owner, secondCreated.id)
  await first.workflow.prepareReview(owner, secondCreated.id, 'Subject two', 'Body two'); await first.workflow.review(reviewer, secondCreated.id, 'APPROVE', 'Reviewed')
  await assertCode(() => first.workflow.sendOutreach(owner, secondCreated.id), 'FIRM_RATE_LIMIT')
})

test('opt-out remains locally suppressed when provider propagation fails', async () => {
  const value = await qualified(); value.failOptOut()
  const result = await value.workflow.optOut(owner, value.id, 'Recipient requested no further contact')
  assert.equal(result.lifecycle, 'SUPPRESSED')
  assert.equal(await value.repository.isSuppressed(owner.firmId, result.normalizedEmail), true)
  assert.equal(result.privacy?.propagationStatus, 'RETRY_REQUIRED')
})

test('provider suppression is recorded locally during review preparation', async () => {
  const value = await qualified(); value.setPrivacy({ suppressed: true })
  const result = await value.workflow.prepareReview(owner, value.id, 'Subject', 'Body')
  assert.equal(result.lifecycle, 'SUPPRESSED')
  assert.equal(await value.repository.isSuppressed(owner.firmId, result.normalizedEmail), true)
})

test('changed privacy policy invalidates an existing approval manifest', async () => {
  const value = await approved(); value.setPrivacy({ policyVersion: 'v2' })
  await assertCode(() => value.workflow.sendOutreach(owner, value.id), 'APPROVAL_STALE')
})

test('CRM outbound failure persists retry state and later records provider identity', async () => {
  const value = await qualified(); value.failCrm()
  assert.equal((await value.workflow.syncOutbound(owner, value.id)).sync.status, 'RETRY_WAIT')
  await assertCode(() => value.workflow.syncOutbound(owner, value.id), 'RETRY_NOT_DUE')
  value.advance(300_000)
  const synced = await value.workflow.syncOutbound(owner, value.id)
  assert.equal(synced.sync.status, 'SYNCED'); assert.equal(synced.externalIdentity?.externalId, 'prospect-external-1')
  assert.notEqual(value.crmPushKeys[0], '')
})

test('calendar handoff failure persists and can be retried after its due time', async () => {
  const value = await approved(); await value.workflow.sendOutreach(owner, value.id); await value.workflow.verifyEngagement(owner, value.id)
  value.failCalendar()
  assert.equal((await value.workflow.handoff(owner, value.id, '2026-07-21T12:00:00.000Z')).lifecycle, 'HANDOFF_RETRY')
  await assertCode(() => value.workflow.handoff(owner, value.id, '2026-07-21T12:00:00.000Z'), 'RETRY_NOT_DUE')
  value.advance(300_000)
  assert.equal((await value.workflow.handoff(owner, value.id, '2026-07-21T12:00:00.000Z')).lifecycle, 'HANDED_OFF')
})

test('manager metrics report data quality, deduplication, and funnel conversion', async () => {
  const value = await approved(); await value.workflow.sendOutreach(owner, value.id); await value.workflow.verifyEngagement(owner, value.id); value.advance(1_000)
  await value.workflow.handoff(owner, value.id, '2026-07-21T12:00:00.000Z')
  const metrics = await value.workflow.metrics(admin)
  assert.equal(metrics.total, 1); assert.equal(metrics.conversion.approvedToSent, 1); assert.equal(metrics.conversion.sentToEngaged, 1); assert.equal(metrics.conversion.engagedToHandoff, 1)
  await assertCode(() => value.workflow.metrics(owner), 'MANAGER_REQUIRED')
})

test('optimistic concurrency rejects stale mutations', async () => {
  const value = fixture()
  const created = await value.workflow.createManual(admin, { email: 'lead@example.com', givenName: 'A', familyName: 'B', company: 'C', region: 'US', source: 'WEB' })
  const stale = structuredClone(created)
  await value.workflow.assignOwner(admin, created.id, owner.userId)
  await assertCode(() => value.repository.mutate(stale.id, stale.version, stale, admin, 'STALE_WRITE', {}), 'VERSION_CONFLICT')
})
