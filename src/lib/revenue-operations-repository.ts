import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import prisma from './prisma'
import {
  canonicalRevenue,
  RevenueWorkflowError,
  revenueHash,
  type RevenueActor,
  type RevenueAuditEvent,
  type RevenueMetrics,
  type RevenueRepository,
  type RevenueState,
} from './revenue-operations-workflow'

const json = (value: unknown) => value as Prisma.InputJsonValue

function fromRow(row: {
  state: Prisma.JsonValue
  lifecycle: string
  version: number
  ownerId: string | null
  retryAt: Date | null
  linkedClientId: string | null
}): RevenueState {
  const state = structuredClone(row.state) as unknown as RevenueState
  state.lifecycle = row.lifecycle; state.version = row.version; state.ownerId = row.ownerId; state.retryAt = row.retryAt?.toISOString() ?? null
  if (row.linkedClientId && state.handoff) state.handoff.linkedClientId = row.linkedClientId
  return state
}

const ratio = (numerator: number, denominator: number) => denominator ? Number((numerator / denominator).toFixed(4)) : 0

export class PrismaRevenueRepository implements RevenueRepository {
  async canManage(actor: RevenueActor) {
    const user = await prisma.user.findFirst({ where: { id: actor.userId, firmId: actor.firmId, isActive: true }, select: { role: true } })
    return Boolean(user && ['ADMIN', 'PARTNER'].includes(user.role))
  }

  async userInFirm(userId: string, firmId: string) {
    return (await prisma.user.count({ where: { id: userId, firmId, isActive: true } })) === 1
  }

  async findIdentity(firmId: string, provider: string, externalId: string, normalizedEmail: string) {
    const external = provider && externalId ? [{ crmProvider: provider, externalId }] : []
    const row = await prisma.revenueProspect.findFirst({ where: { firmId, OR: [{ normalizedEmail }, ...external] } })
    return row ? fromRow(row) : null
  }

  async create(state: RevenueState, actor: RevenueActor, action: string, payload: Record<string, unknown>) {
    return prisma.$transaction(async (transaction) => {
      await transaction.revenueProspect.create({ data: {
        id: state.id, firmId: state.firmId, createdById: state.createdBy, ownerId: state.ownerId,
        normalizedEmail: state.normalizedEmail, crmProvider: state.externalIdentity?.provider ?? null, externalId: state.externalIdentity?.externalId ?? null,
        lifecycle: state.lifecycle, version: state.version, state: json(state), retryAt: null,
      } })
      await this.append(transaction, state, actor, action, payload)
      return state
    })
  }

  async load(id: string) { const row = await prisma.revenueProspect.findUnique({ where: { id } }); return row ? fromRow(row) : null }

  async mutate(id: string, expectedVersion: number, state: RevenueState, actor: RevenueActor, action: string, payload: Record<string, unknown>) {
    return prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`
      const current = await transaction.revenueProspect.findUnique({ where: { id } })
      if (!current) throw new RevenueWorkflowError('PROSPECT_NOT_FOUND', 'Prospect not found', 404)
      if (current.version !== expectedVersion) throw new RevenueWorkflowError('VERSION_CONFLICT', 'Prospect changed; reload before retrying', 409)
      const next = structuredClone(state)
      next.version = expectedVersion + 1; next.updatedAt = new Date().toISOString()
      let linkedClientId = current.linkedClientId
      if (action === 'HANDOFF_COMPLETED' && !linkedClientId) {
        const client = await transaction.client.create({ data: {
          clientNumber: `CRM-${next.id}`,
          type: next.company ? 'BUSINESS' : 'INDIVIDUAL',
          status: 'PROSPECT',
          displayName: String(payload.displayName),
          firstName: next.givenName || null,
          lastName: next.familyName || null,
          companyName: next.company || null,
          email: next.normalizedEmail,
          country: next.region === 'CA' ? 'Canada' : next.region,
          referralSource: next.attribution.source,
          tags: ['governed-revenue-handoff'],
          firmId: next.firmId,
        } })
        linkedClientId = client.id
        if (next.handoff) next.handoff.linkedClientId = client.id
      }
      const updated = await transaction.revenueProspect.updateMany({
        where: { id, version: expectedVersion },
        data: {
          ownerId: next.ownerId, crmProvider: next.externalIdentity?.provider ?? null, externalId: next.externalIdentity?.externalId ?? null,
          lifecycle: next.lifecycle, version: next.version, state: json(next), retryAt: next.retryAt ? new Date(next.retryAt) : null, linkedClientId,
        },
      })
      if (updated.count !== 1) throw new RevenueWorkflowError('VERSION_CONFLICT', 'Prospect changed; reload before retrying', 409)
      if (action === 'OUTREACH_SENT') {
        await transaction.revenueDeliveryEvidence.create({ data: {
          id: randomUUID(), prospectId: id, provider: String(payload.provider), reference: String(payload.reference),
          idempotencyKey: String(payload.idempotencyKey), contentHash: String(payload.contentHash), consentReference: String(payload.consentReference), sentAt: new Date(String(payload.sentAt)),
        } })
      }
      await this.append(transaction, next, actor, action, payload)
      return next
    })
  }

  async auditEvents(id: string): Promise<RevenueAuditEvent[]> {
    const rows = await prisma.revenueAuditEvent.findMany({ where: { prospectId: id }, orderBy: { sequence: 'asc' } })
    return rows.map((row) => ({ prospectId: row.prospectId, firmId: row.firmId, sequence: row.sequence, actorId: row.actorId, action: row.action, payload: row.payload as Record<string, unknown>, previousHash: row.previousHash, eventHash: row.eventHash, createdAt: row.createdAt.toISOString() }))
  }

  async list(firmId: string) {
    const rows = await prisma.revenueProspect.findMany({ where: { firmId }, orderBy: { updatedAt: 'desc' }, take: 200 })
    return rows.map(fromRow)
  }
  async isSuppressed(firmId: string, normalizedEmail: string) { return Boolean(await prisma.revenueSuppression.findUnique({ where: { firmId_normalizedEmail: { firmId, normalizedEmail } }, select: { id: true } })) }
  async recordSuppression(firmId: string, normalizedEmail: string, evidence: Record<string, unknown>) {
    await prisma.revenueSuppression.upsert({
      where: { firmId_normalizedEmail: { firmId, normalizedEmail } },
      create: { id: randomUUID(), firmId, normalizedEmail, reason: String(evidence.reason), source: String(evidence.source), externalReference: evidence.externalReference ? String(evidence.externalReference) : null, occurredAt: new Date(String(evidence.occurredAt)) },
      update: { reason: String(evidence.reason), source: String(evidence.source), externalReference: evidence.externalReference ? String(evidence.externalReference) : null, occurredAt: new Date(String(evidence.occurredAt)) },
    })
  }
  async recentDeliveryCount(firmId: string, since: Date) { return prisma.revenueDeliveryEvidence.count({ where: { prospect: { firmId }, sentAt: { gte: since } } }) }

  async metrics(firmId: string): Promise<RevenueMetrics> {
    const rows = await prisma.revenueProspect.findMany({ where: { firmId }, select: { lifecycle: true, state: true } })
    const byLifecycle: Record<string, number> = {}
    for (const row of rows) byLifecycle[row.lifecycle] = (byLifecycle[row.lifecycle] ?? 0) + 1
    const [delivered, suppressed, merged, approved, engaged, handoff] = await Promise.all([
      prisma.revenueDeliveryEvidence.count({ where: { prospect: { firmId } } }),
      prisma.revenueSuppression.count({ where: { firmId } }),
      prisma.revenueAuditEvent.count({ where: { firmId, action: 'CRM_INBOUND_MERGED' } }),
      prisma.revenueAuditEvent.count({ where: { firmId, action: 'OUTREACH_APPROVED' } }),
      prisma.revenueAuditEvent.count({ where: { firmId, action: 'ENGAGEMENT_VERIFIED' } }),
      prisma.revenueAuditEvent.count({ where: { firmId, action: 'HANDOFF_COMPLETED' } }),
    ])
    const scores = rows.map((row) => Number((row.state as Record<string, unknown> & { dataQuality?: { score?: number } }).dataQuality?.score ?? 0))
    return {
      total: rows.length, byLifecycle, delivered, suppressed, duplicatesMerged: merged,
      conversion: { approvedToSent: ratio(delivered, approved), sentToEngaged: ratio(engaged, delivered), engagedToHandoff: ratio(handoff, engaged) },
      dataQuality: { averageScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0, belowThreshold: scores.filter((score) => score < 80).length },
    }
  }

  private async append(transaction: Prisma.TransactionClient, state: RevenueState, actor: RevenueActor, action: string, payload: Record<string, unknown>) {
    const previous = await transaction.revenueAuditEvent.findFirst({ where: { prospectId: state.id }, orderBy: { sequence: 'desc' } })
    const sequence = (previous?.sequence ?? 0) + 1; const previousHash = previous?.eventHash ?? 'GENESIS'
    const body = { prospectId: state.id, firmId: state.firmId, sequence, actorId: actor.userId, action, payload, previousHash }
    await transaction.revenueAuditEvent.create({ data: { id: randomUUID(), prospectId: state.id, firmId: state.firmId, sequence, actorId: actor.userId, action, payload: json(payload), previousHash, eventHash: revenueHash(canonicalRevenue(body)) } })
  }
}
