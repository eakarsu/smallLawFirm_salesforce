import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import bcrypt from 'bcryptjs'
import prisma from '../../src/lib/prisma'
import { PrismaRevenueRepository } from '../../src/lib/revenue-operations-repository'
import { RevenueOperationsWorkflow, RevenueWorkflowError, canonicalRevenue, revenueHash, type RevenueActor, type RevenueProviders } from '../../src/lib/revenue-operations-workflow'

const now = new Date('2026-07-20T12:00:00.000Z')

async function fixture() {
  const suffix = randomUUID()
  const firm = await prisma.firm.create({ data: { name: `Integration Firm ${suffix}` } })
  const password = await bcrypt.hash('Integration1!SecurePassword', 4)
  const adminRow = await prisma.user.create({ data: { email: `admin-${suffix}@example.com`, password, firstName: 'Admin', lastName: 'User', role: 'ADMIN', firmId: firm.id } })
  const partnerRow = await prisma.user.create({ data: { email: `partner-${suffix}@example.com`, password, firstName: 'Review', lastName: 'Partner', role: 'PARTNER', firmId: firm.id } })
  const ownerRow = await prisma.user.create({ data: { email: `owner-${suffix}@example.com`, password, firstName: 'Owner', lastName: 'Attorney', role: 'ATTORNEY', firmId: firm.id } })
  const admin: RevenueActor = { userId: adminRow.id, firmId: firm.id, role: 'ADMIN' }
  const partner: RevenueActor = { userId: partnerRow.id, firmId: firm.id, role: 'PARTNER' }
  const owner: RevenueActor = { userId: ownerRow.id, firmId: firm.id, role: 'ATTORNEY' }
  const providers: RevenueProviders = {
    crm: {
      pull: async () => ({ provider: 'crm-integration', reference: 'pull-1', records: [] }),
      push: async (value) => value.operation === 'UPSERT_ACCOUNT'
        ? { provider: 'crm-integration', reference: 'account-1', externalAccountId: 'account-1' }
        : { provider: 'crm-integration', reference: 'prospect-1', externalId: 'prospect-1', externalVersion: '1' },
    },
    enrichment: { lookup: async () => ({ provider: 'enrichment-integration', reference: 'enrich-1', verifiedAt: '2026-07-20T11:59:00.000Z', region: 'US', company: 'Database Acme', companyDomain: 'db-acme.example' }) },
    privacy: {
      evaluate: async (value) => ({ provider: 'privacy-integration', reference: 'privacy-1', checkedAt: '2026-07-20T11:59:00.000Z', email: value.email, region: value.region, consentStatus: 'NOT_REQUIRED', lawfulBasis: 'LEGITIMATE_INTEREST', policyVersion: '2026-07', suppressed: false }),
      recordOptOut: async () => ({ provider: 'privacy-integration', reference: 'optout-1', occurredAt: now.toISOString() }),
    },
    email: {
      preflight: async (value) => ({ provider: 'email-integration', reference: 'preflight-1', email: value.email, checkedAt: '2026-07-20T11:59:00.000Z', status: 'DELIVERABLE', score: 0.99, authenticatedDomain: true }),
      send: async (value) => ({ provider: 'email-integration', reference: 'message-1', acceptedAt: now.toISOString(), contentHash: revenueHash(canonicalRevenue({ subject: value.subject, body: value.body })) }),
      status: async (value) => ({ provider: 'email-integration', reference: value.reference, status: 'REPLIED', messageHash: revenueHash('database reply'), occurredAt: now.toISOString() }),
    },
    calendar: { upsert: async () => ({ provider: 'calendar-integration', reference: 'event-1' }) },
  }
  const repository = new PrismaRevenueRepository()
  return { firm, admin, partner, owner, repository, workflow: new RevenueOperationsWorkflow(repository, providers, () => new Date(now)) }
}

test.after(async () => { await prisma.$disconnect() })

test('database-backed workflow persists immutable delivery, audit evidence, and client handoff', async () => {
  const value = await fixture()
  const created = await value.workflow.createManual(value.admin, { email: `lead-${randomUUID()}@example.com`, givenName: 'Dana', familyName: 'Lead', company: 'Database Acme', region: 'US', source: 'INTEGRATION' })
  await value.workflow.assignOwner(value.admin, created.id, value.owner.userId)
  await value.workflow.enrich(value.owner, created.id)
  await value.workflow.prepareReview(value.owner, created.id, 'Reviewed subject', 'Reviewed database message')
  await value.workflow.review(value.partner, created.id, 'APPROVE', 'Independent database review')
  await value.workflow.sendOutreach(value.owner, created.id)
  await value.workflow.verifyEngagement(value.owner, created.id)
  const handedOff = await value.workflow.handoff(value.owner, created.id, '2026-07-21T12:00:00.000Z')
  assert.equal(handedOff.lifecycle, 'HANDED_OFF')
  const prospect = await prisma.revenueProspect.findUniqueOrThrow({ where: { id: created.id } })
  assert.ok(prospect.linkedClientId)
  assert.equal(await prisma.client.count({ where: { id: prospect.linkedClientId!, firmId: value.firm.id, status: 'PROSPECT' } }), 1)
  const delivery = await prisma.revenueDeliveryEvidence.findFirstOrThrow({ where: { prospectId: created.id } })
  const audit = await prisma.revenueAuditEvent.findMany({ where: { prospectId: created.id }, orderBy: { sequence: 'asc' } })
  assert.ok(audit.length >= 8); assert.equal(audit[0].previousHash, 'GENESIS'); assert.equal(audit.at(-1)?.action, 'HANDOFF_COMPLETED')
  await assert.rejects(() => prisma.$executeRawUnsafe(`UPDATE "RevenueDeliveryEvidence" SET "reference" = 'tampered' WHERE "id" = '${delivery.id}'`))
  await assert.rejects(() => prisma.$executeRawUnsafe(`DELETE FROM "RevenueAuditEvent" WHERE "prospectId" = '${created.id}'`))
})

test('database identity uniqueness prevents duplicate prospects inside one firm', async () => {
  const value = await fixture(); const email = `duplicate-${randomUUID()}@example.com`
  await value.workflow.createManual(value.admin, { email, givenName: 'One', familyName: 'Lead', company: 'A', region: 'US', source: 'WEB' })
  await assert.rejects(() => value.workflow.createManual(value.admin, { email: email.toUpperCase(), givenName: 'Two', familyName: 'Lead', company: 'B', region: 'US', source: 'EVENT' }), (error: unknown) => error instanceof RevenueWorkflowError && error.code === 'DUPLICATE_PROSPECT')
})

test('advisory locking and version checks allow only one concurrent state transition', async () => {
  const value = await fixture()
  const created = await value.workflow.createManual(value.admin, { email: `race-${randomUUID()}@example.com`, givenName: 'Race', familyName: 'Lead', company: 'A', region: 'US', source: 'WEB' })
  const left = structuredClone(created); left.company = 'Left'
  const right = structuredClone(created); right.company = 'Right'
  const results = await Promise.allSettled([
    value.repository.mutate(created.id, created.version, left, value.admin, 'LEFT_WRITE', {}),
    value.repository.mutate(created.id, created.version, right, value.admin, 'RIGHT_WRITE', {}),
  ])
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal(results.filter((result) => result.status === 'rejected' && result.reason instanceof RevenueWorkflowError && result.reason.code === 'VERSION_CONFLICT').length, 1)
})

test('suppression upsert is firm-scoped and metrics are derived from persisted evidence', async () => {
  const value = await fixture()
  const created = await value.workflow.createManual(value.admin, { email: `optout-${randomUUID()}@example.com`, givenName: 'Opt', familyName: 'Out', company: 'A', region: 'US', source: 'WEB' })
  await value.workflow.optOut(value.admin, created.id, 'Recipient opt-out')
  await value.workflow.optOut(value.admin, created.id, 'Recipient repeated opt-out')
  assert.equal(await prisma.revenueSuppression.count({ where: { firmId: value.firm.id, normalizedEmail: created.normalizedEmail } }), 1)
  const metrics = await value.workflow.metrics(value.admin)
  assert.equal(metrics.total, 1); assert.equal(metrics.suppressed, 1); assert.equal(metrics.byLifecycle.SUPPRESSED, 1)
})
