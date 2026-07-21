import assert from 'node:assert/strict'
import test from 'node:test'
import { MemoryRevenueRepository, RevenueOperationsWorkflow, canonicalRevenue, revenueHash, type RevenueActor, type RevenueProviders } from '../../src/lib/revenue-operations-workflow'

test('representative CRM lead completes consent-reviewed outreach and accountable client handoff', async () => {
  let now = new Date('2026-07-20T12:00:00.000Z')
  const manager: RevenueActor = { userId: 'admin', firmId: 'firm', role: 'ADMIN' }
  const owner: RevenueActor = { userId: 'owner', firmId: 'firm', role: 'ATTORNEY' }
  const reviewer: RevenueActor = { userId: 'reviewer', firmId: 'firm', role: 'PARTNER' }
  const calls: string[] = []
  const providers: RevenueProviders = {
    crm: {
      pull: async () => ({ provider: 'crm', reference: 'batch-1', nextCursor: 'batch-2', records: [{ externalId: 'crm-lead-7', email: 'decision-maker@example.com', givenName: 'Riley', familyName: 'Morgan', company: 'Morgan Services', region: 'US', source: 'CONFERENCE', campaign: '2026-legal-ops' }] }),
      push: async (value) => { calls.push(String(value.operation)); return value.operation === 'UPSERT_ACCOUNT' ? { provider: 'crm', reference: 'account-write-1', externalAccountId: 'account-7' } : { provider: 'crm', reference: 'prospect-write-1', externalId: 'crm-lead-7', externalVersion: '8' } },
    },
    enrichment: { lookup: async () => ({ provider: 'enrichment', reference: 'enrich-7', verifiedAt: '2026-07-20T11:59:00.000Z', region: 'US', company: 'Morgan Services', companyDomain: 'morgan.example' }) },
    privacy: {
      evaluate: async (value) => ({ provider: 'privacy', reference: 'policy-check-7', checkedAt: '2026-07-20T11:59:30.000Z', email: value.email, region: value.region, consentStatus: 'NOT_REQUIRED', lawfulBasis: 'LEGITIMATE_INTEREST', policyVersion: 'us-b2b-2026-07', suppressed: false }),
      recordOptOut: async () => ({ provider: 'privacy', reference: 'unused', occurredAt: now.toISOString() }),
    },
    email: {
      preflight: async (value) => ({ provider: 'delivery', reference: 'preflight-7', email: value.email, checkedAt: '2026-07-20T11:59:30.000Z', status: 'DELIVERABLE', score: 0.97, authenticatedDomain: true }),
      send: async (value) => { calls.push('SEND_REVIEWED_CONTENT'); return { provider: 'delivery', reference: 'message-7', acceptedAt: now.toISOString(), contentHash: revenueHash(canonicalRevenue({ subject: value.subject, body: value.body })) } },
      status: async (value) => ({ provider: 'delivery', reference: value.reference, status: 'REPLIED', messageHash: revenueHash('reply-7'), occurredAt: now.toISOString() }),
    },
    calendar: { upsert: async () => { calls.push('UPSERT_CALENDAR'); return { provider: 'calendar', reference: 'consultation-7' } } },
  }
  const workflow = new RevenueOperationsWorkflow(new MemoryRevenueRepository(), providers, () => new Date(now), 25)
  const imported = await workflow.syncInbound(manager)
  assert.deepEqual({ created: imported.created, merged: imported.merged }, { created: 1, merged: 0 })
  const id = imported.prospects[0].id
  await workflow.assignOwner(manager, id, owner.userId)
  await workflow.enrich(owner, id)
  await workflow.prepareReview(owner, id, 'A practical legal operations conversation', 'Would a short consultation about your current workflow be useful?')
  await workflow.review(reviewer, id, 'APPROVE', 'Audience, lawful basis, sender, and exact content verified')
  assert.equal((await workflow.sendOutreach(owner, id)).lifecycle, 'OUTREACH_SENT')
  assert.equal((await workflow.verifyEngagement(owner, id)).lifecycle, 'ENGAGED')
  now = new Date('2026-07-20T12:05:00.000Z')
  const completed = await workflow.handoff(owner, id, '2026-07-21T15:00:00.000Z')
  assert.equal(completed.lifecycle, 'HANDED_OFF')
  assert.deepEqual(calls, ['SEND_REVIEWED_CONTENT', 'UPSERT_CALENDAR', 'UPSERT_ACCOUNT'])
  const audit = (await workflow.view(owner, id)).audit!
  assert.deepEqual(audit.map((event) => event.action), ['CRM_PROSPECT_IMPORTED', 'OWNER_ASSIGNED', 'PROSPECT_ENRICHED', 'OUTREACH_REVIEW_REQUESTED', 'OUTREACH_APPROVED', 'OUTREACH_SENT', 'ENGAGEMENT_VERIFIED', 'HANDOFF_COMPLETED'])
})
