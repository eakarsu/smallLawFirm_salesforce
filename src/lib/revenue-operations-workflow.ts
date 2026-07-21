import { createHash, randomUUID } from 'node:crypto'

export interface RevenueActor { userId: string; firmId: string; role: string }

export interface RevenueProviders {
  crm: {
    pull(value: Record<string, unknown>): Promise<Record<string, unknown>>
    push(value: Record<string, unknown>): Promise<Record<string, unknown>>
  }
  enrichment: { lookup(value: Record<string, unknown>): Promise<Record<string, unknown>> }
  privacy: {
    evaluate(value: Record<string, unknown>): Promise<Record<string, unknown>>
    recordOptOut(value: Record<string, unknown>): Promise<Record<string, unknown>>
  }
  email: {
    preflight(value: Record<string, unknown>): Promise<Record<string, unknown>>
    send(value: Record<string, unknown>): Promise<Record<string, unknown>>
    status(value: Record<string, unknown>): Promise<Record<string, unknown>>
  }
  calendar: { upsert(value: Record<string, unknown>): Promise<Record<string, unknown>> }
}

export interface RevenueAuditEvent {
  prospectId: string
  firmId: string
  sequence: number
  actorId: string
  action: string
  payload: Record<string, unknown>
  previousHash: string
  eventHash: string
  createdAt: string
}

export interface RevenueState {
  id: string
  firmId: string
  normalizedEmail: string
  givenName: string
  familyName: string
  company: string
  region: string
  lifecycle: string
  version: number
  createdBy: string
  ownerId: string | null
  externalIdentity: { provider: string; externalId: string; externalVersion: string | null } | null
  attribution: {
    source: string
    campaign: string | null
    firstTouchAt: string
    lastTouchAt: string
    touches: Array<Record<string, unknown>>
  }
  enrichment: Record<string, unknown> | null
  privacy: Record<string, unknown> | null
  deliverability: Record<string, unknown> | null
  review: Record<string, unknown> | null
  outreach: Record<string, unknown> | null
  engagement: Record<string, unknown> | null
  handoff: Record<string, unknown> | null
  sync: Record<string, unknown>
  dataQuality: { score: number; missing: string[] }
  retryAt: string | null
  createdAt: string
  updatedAt: string
  audit?: RevenueAuditEvent[]
}

export interface RevenueMetrics {
  total: number
  byLifecycle: Record<string, number>
  delivered: number
  suppressed: number
  duplicatesMerged: number
  conversion: { approvedToSent: number; sentToEngaged: number; engagedToHandoff: number }
  dataQuality: { averageScore: number; belowThreshold: number }
}

export interface RevenueRepository {
  canManage(actor: RevenueActor): Promise<boolean>
  userInFirm(userId: string, firmId: string): Promise<boolean>
  findIdentity(firmId: string, provider: string, externalId: string, normalizedEmail: string): Promise<RevenueState | null>
  create(state: RevenueState, actor: RevenueActor, action: string, payload: Record<string, unknown>): Promise<RevenueState>
  load(id: string): Promise<RevenueState | null>
  mutate(id: string, expectedVersion: number, state: RevenueState, actor: RevenueActor, action: string, payload: Record<string, unknown>): Promise<RevenueState>
  auditEvents(id: string): Promise<RevenueAuditEvent[]>
  list(firmId: string): Promise<RevenueState[]>
  isSuppressed(firmId: string, normalizedEmail: string): Promise<boolean>
  recordSuppression(firmId: string, normalizedEmail: string, evidence: Record<string, unknown>): Promise<void>
  recentDeliveryCount(firmId: string, since: Date): Promise<number>
  metrics(firmId: string): Promise<RevenueMetrics>
}

export class RevenueWorkflowError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message) }
}

export function canonicalRevenue(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value)
    return encoded === undefined ? 'null' : encoded
  }
  if (Array.isArray(value)) return `[${value.map(canonicalRevenue).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalRevenue(record[key])}`).join(',')}}`
}

export function revenueHash(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

const clone = <T>(value: T): T => structuredClone(value)

export class MemoryRevenueRepository implements RevenueRepository {
  readonly states = new Map<string, RevenueState>()
  readonly events = new Map<string, RevenueAuditEvent[]>()
  readonly suppressions = new Set<string>()

  async canManage(actor: RevenueActor) { return ['ADMIN', 'PARTNER'].includes(actor.role) }
  async userInFirm() { return true }
  async findIdentity(firmId: string, provider: string, externalId: string, email: string) {
    const state = [...this.states.values()].find((item) => item.firmId === firmId && (
      item.normalizedEmail === email || (item.externalIdentity?.provider === provider && item.externalIdentity.externalId === externalId)
    ))
    return state ? clone(state) : null
  }
  async create(state: RevenueState, actor: RevenueActor, action: string, payload: Record<string, unknown>) {
    if (this.states.has(state.id)) throw new RevenueWorkflowError('DUPLICATE_PROSPECT', 'Prospect already exists', 409)
    this.states.set(state.id, clone(state)); this.events.set(state.id, []); this.append(state, actor, action, payload)
    return clone(state)
  }
  async load(id: string) { const value = this.states.get(id); return value ? clone(value) : null }
  async mutate(id: string, expected: number, state: RevenueState, actor: RevenueActor, action: string, payload: Record<string, unknown>) {
    const current = this.states.get(id)
    if (!current) throw new RevenueWorkflowError('PROSPECT_NOT_FOUND', 'Prospect not found', 404)
    if (current.version !== expected) throw new RevenueWorkflowError('VERSION_CONFLICT', 'Prospect changed; reload before retrying', 409)
    const next = clone(state); next.version = expected + 1; next.updatedAt = new Date().toISOString()
    this.states.set(id, next); this.append(next, actor, action, payload); return clone(next)
  }
  async auditEvents(id: string) { return clone(this.events.get(id) ?? []) }
  async list(firmId: string) { return [...this.states.values()].filter((item) => item.firmId === firmId).map(clone) }
  async isSuppressed(firmId: string, email: string) { return this.suppressions.has(`${firmId}:${email}`) }
  async recordSuppression(firmId: string, email: string) { this.suppressions.add(`${firmId}:${email}`) }
  async recentDeliveryCount(firmId: string, since: Date) {
    return [...this.events.values()].flat().filter((event) => event.firmId === firmId && event.action === 'OUTREACH_SENT' && new Date(event.createdAt) >= since).length
  }
  async metrics(firmId: string): Promise<RevenueMetrics> {
    const states = [...this.states.values()].filter((item) => item.firmId === firmId)
    const byLifecycle: Record<string, number> = {}
    for (const item of states) byLifecycle[item.lifecycle] = (byLifecycle[item.lifecycle] ?? 0) + 1
    const events = [...this.events.values()].flat().filter((event) => event.firmId === firmId)
    const count = (action: string) => events.filter((event) => event.action === action).length
    const delivered = count('OUTREACH_SENT'); const engaged = count('ENGAGEMENT_VERIFIED'); const handoff = count('HANDOFF_COMPLETED')
    const approved = count('OUTREACH_APPROVED')
    return {
      total: states.length, byLifecycle, delivered, suppressed: byLifecycle.SUPPRESSED ?? 0, duplicatesMerged: count('CRM_INBOUND_MERGED'),
      conversion: { approvedToSent: ratio(delivered, approved), sentToEngaged: ratio(engaged, delivered), engagedToHandoff: ratio(handoff, engaged) },
      dataQuality: { averageScore: states.length ? Math.round(states.reduce((sum, state) => sum + state.dataQuality.score, 0) / states.length) : 0, belowThreshold: states.filter((state) => state.dataQuality.score < 80).length },
    }
  }
  private append(state: RevenueState, actor: RevenueActor, action: string, payload: Record<string, unknown>) {
    const list = this.events.get(state.id)!; const sequence = list.length + 1; const previousHash = list.at(-1)?.eventHash ?? 'GENESIS'
    const body = { prospectId: state.id, firmId: state.firmId, sequence, actorId: actor.userId, action, payload, previousHash }
    list.push({ ...body, eventHash: revenueHash(canonicalRevenue(body)), createdAt: new Date().toISOString() })
  }
}

const ratio = (numerator: number, denominator: number) => denominator ? Number((numerator / denominator).toFixed(4)) : 0

export class RevenueOperationsWorkflow {
  static readonly MANAGERS = new Set(['ADMIN', 'PARTNER'])
  static readonly EXPLICIT_CONSENT_REGIONS = new Set(['EEA', 'EU', 'UK', 'CA'])

  constructor(
    private readonly repository: RevenueRepository,
    private readonly providers: RevenueProviders,
    private readonly clock: () => Date = () => new Date(),
    private readonly hourlyLimit = 100,
  ) {}

  async syncInbound(actor: RevenueActor, cursor?: string) {
    await this.manager(actor)
    const result = await this.providers.crm.pull({ firmId: actor.firmId, cursor: cursor ?? null, limit: 100, idempotencyKey: `crm-pull:${actor.firmId}:${cursor ?? 'initial'}` })
    this.evidence('crm', result)
    if (!Array.isArray(result.records) || result.records.length > 100) throw new RevenueWorkflowError('CRM_RESPONSE_INVALID', 'CRM returned an invalid record batch', 502)
    let created = 0; let merged = 0; let deduplicated = 0
    const prospects: RevenueState[] = []
    const seen = new Set<string>()
    for (const raw of result.records) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new RevenueWorkflowError('CRM_RECORD_INVALID', 'CRM record is invalid', 502)
      const record = raw as Record<string, unknown>
      const externalId = this.text('externalId', record.externalId, 200)
      const email = this.email(record.email)
      if (seen.has(email)) deduplicated += 1
      seen.add(email)
      const existing = await this.repository.findIdentity(actor.firmId, String(result.provider), externalId, email)
      if (existing) {
        existing.givenName = this.optional(record.givenName, 100) || existing.givenName
        existing.familyName = this.optional(record.familyName, 100) || existing.familyName
        existing.company = this.optional(record.company, 180) || existing.company
        existing.region = this.optional(record.region, 20).toUpperCase() || existing.region
        existing.externalIdentity = { provider: String(result.provider), externalId, externalVersion: this.optional(record.externalVersion, 100) || null }
        existing.attribution.lastTouchAt = this.clock().toISOString()
        existing.attribution.touches.push({ source: this.optional(record.source, 100) || 'CRM', campaign: this.optional(record.campaign, 100) || null, externalId, at: this.clock().toISOString() })
        existing.attribution.touches = existing.attribution.touches.slice(-50)
        existing.sync = { status: 'SYNCED', lastInboundAt: this.clock().toISOString(), provider: result.provider, reference: result.reference, cursor: result.nextCursor ?? null }
        existing.dataQuality = this.quality(existing)
        prospects.push(await this.save(existing, actor, 'CRM_INBOUND_MERGED', { provider: result.provider, reference: result.reference, externalId, emailHash: revenueHash(email) }, false))
        merged += 1
      } else {
        const at = this.clock().toISOString(); const source = this.optional(record.source, 100) || 'CRM'
        const state: RevenueState = {
          id: randomUUID(), firmId: actor.firmId, normalizedEmail: email,
          givenName: this.optional(record.givenName, 100), familyName: this.optional(record.familyName, 100), company: this.optional(record.company, 180), region: this.optional(record.region, 20).toUpperCase(),
          lifecycle: 'NEW', version: 1, createdBy: actor.userId, ownerId: null,
          externalIdentity: { provider: String(result.provider), externalId, externalVersion: this.optional(record.externalVersion, 100) || null },
          attribution: { source, campaign: this.optional(record.campaign, 100) || null, firstTouchAt: at, lastTouchAt: at, touches: [{ source, externalId, at }] },
          enrichment: null, privacy: null, deliverability: null, review: null, outreach: null, engagement: null, handoff: null,
          sync: { status: 'SYNCED', lastInboundAt: at, provider: result.provider, reference: result.reference, cursor: result.nextCursor ?? null },
          dataQuality: { score: 0, missing: [] }, retryAt: null, createdAt: at, updatedAt: at,
        }
        state.dataQuality = this.quality(state)
        prospects.push(await this.repository.create(state, actor, 'CRM_PROSPECT_IMPORTED', { provider: result.provider, reference: result.reference, externalId, emailHash: revenueHash(email), source }))
        created += 1
      }
    }
    return { created, merged, deduplicated, prospects, nextCursor: result.nextCursor ?? null, reference: result.reference }
  }

  async createManual(actor: RevenueActor, input: Record<string, unknown>) {
    await this.manager(actor)
    const email = this.email(input.email)
    if (await this.repository.findIdentity(actor.firmId, 'MANUAL', '', email)) throw new RevenueWorkflowError('DUPLICATE_PROSPECT', 'Prospect already exists', 409)
    const at = this.clock().toISOString()
    const state: RevenueState = {
      id: randomUUID(), firmId: actor.firmId, normalizedEmail: email, givenName: this.optional(input.givenName, 100), familyName: this.optional(input.familyName, 100), company: this.optional(input.company, 180), region: this.optional(input.region, 20).toUpperCase(),
      lifecycle: 'NEW', version: 1, createdBy: actor.userId, ownerId: null, externalIdentity: null,
      attribution: { source: this.text('source', input.source, 100), campaign: this.optional(input.campaign, 100) || null, firstTouchAt: at, lastTouchAt: at, touches: [{ source: input.source, at }] },
      enrichment: null, privacy: null, deliverability: null, review: null, outreach: null, engagement: null, handoff: null,
      sync: { status: 'PENDING', attempts: 0 }, dataQuality: { score: 0, missing: [] }, retryAt: null, createdAt: at, updatedAt: at,
    }
    state.dataQuality = this.quality(state)
    return this.repository.create(state, actor, 'MANUAL_PROSPECT_CREATED', { emailHash: revenueHash(email), source: state.attribution.source })
  }

  async assignOwner(actor: RevenueActor, id: string, ownerId: string) {
    await this.manager(actor); const state = await this.authorized(actor, id); ownerId = this.text('ownerId', ownerId, 100)
    if (!(await this.repository.userInFirm(ownerId, actor.firmId))) throw new RevenueWorkflowError('OWNER_NOT_FOUND', 'Active owner was not found in this firm', 404)
    state.ownerId = ownerId; state.lifecycle = state.lifecycle === 'NEW' ? 'OWNED' : state.lifecycle; state.dataQuality = this.quality(state)
    return this.save(state, actor, 'OWNER_ASSIGNED', { ownerId })
  }

  async enrich(actor: RevenueActor, id: string) {
    const state = await this.authorizedOwner(actor, id)
    if (['SUPPRESSED', 'HANDED_OFF'].includes(state.lifecycle)) throw new RevenueWorkflowError('INVALID_STATE', 'Prospect cannot be enriched in its current state', 409)
    const result = await this.providers.enrichment.lookup({ email: state.normalizedEmail, company: state.company, region: state.region, idempotencyKey: `enrich:${state.id}:${state.version}` })
    this.evidence('enrichment', result)
    if (typeof result.verifiedAt !== 'string' || typeof result.region !== 'string') throw new RevenueWorkflowError('ENRICHMENT_INVALID', 'Enrichment provenance is incomplete', 502)
    this.pastDate('verifiedAt', result.verifiedAt)
    state.company = this.optional(result.company, 180) || state.company
    state.region = this.text('region', result.region, 20).toUpperCase()
    state.enrichment = { provider: result.provider, reference: result.reference, verifiedAt: result.verifiedAt, companyDomain: result.companyDomain ?? null, sourceVersion: result.sourceVersion ?? null }
    state.lifecycle = 'ENRICHED'; state.dataQuality = this.quality(state)
    return this.save(state, actor, 'PROSPECT_ENRICHED', { provider: result.provider, reference: result.reference, region: state.region, qualityScore: state.dataQuality.score })
  }

  async prepareReview(actor: RevenueActor, id: string, subject: string, body: string) {
    const state = await this.authorizedOwner(actor, id)
    if (!state.enrichment || !['ENRICHED', 'REJECTED'].includes(state.lifecycle)) throw new RevenueWorkflowError('ENRICHMENT_REQUIRED', 'Verified enrichment is required before review', 409)
    subject = this.text('subject', subject, 180); body = this.text('body', body, 10_000)
    const privacy = await this.evaluatePrivacy(state)
    if (privacy.suppressed === true) return this.suppress(actor, state, 'PROVIDER_SUPPRESSION', privacy)
    this.validatePrivacy(state, privacy)
    const deliverability = await this.evaluateDeliverability(state)
    state.privacy = privacy; state.deliverability = deliverability; state.dataQuality = this.quality(state)
    if (state.dataQuality.score < 80) throw new RevenueWorkflowError('DATA_QUALITY_BLOCKED', `Data quality is below 80: ${state.dataQuality.missing.join(', ')}`, 422)
    const contentHash = revenueHash(canonicalRevenue({ subject, body }))
    state.review = { requestedBy: actor.userId, requestedAt: this.clock().toISOString(), subject, body, contentHash, manifestHash: this.manifest(state, subject, body), decision: 'PENDING', reviewerId: null }
    state.lifecycle = 'REVIEW_PENDING'
    return this.save(state, actor, 'OUTREACH_REVIEW_REQUESTED', { contentHash, manifestHash: state.review.manifestHash, privacyReference: privacy.reference, deliverabilityReference: deliverability.reference })
  }

  async review(actor: RevenueActor, id: string, decision: string, notes: string) {
    await this.manager(actor); const state = await this.authorized(actor, id)
    if (state.lifecycle !== 'REVIEW_PENDING' || !state.review) throw new RevenueWorkflowError('REVIEW_NOT_PENDING', 'Outreach is not awaiting review', 409)
    if (actor.userId === state.ownerId || actor.userId === state.review.requestedBy) throw new RevenueWorkflowError('INDEPENDENT_REVIEW_REQUIRED', 'Outreach reviewer must be independent from its owner/requester', 409)
    decision = this.text('decision', decision, 20).toUpperCase(); if (!['APPROVE', 'REJECT'].includes(decision)) throw new RevenueWorkflowError('INVALID_DECISION', 'Decision must be APPROVE or REJECT', 422)
    notes = this.text('notes', notes, 2000)
    if (state.review.manifestHash !== this.manifest(state, String(state.review.subject), String(state.review.body))) throw new RevenueWorkflowError('REVIEW_MANIFEST_CHANGED', 'Outreach changed after review request', 409)
    state.review = { ...state.review, decision, reviewerId: actor.userId, reviewedAt: this.clock().toISOString(), notes }
    state.lifecycle = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'
    return this.save(state, actor, decision === 'APPROVE' ? 'OUTREACH_APPROVED' : 'OUTREACH_REJECTED', { decision, reviewerId: actor.userId, manifestHash: state.review.manifestHash })
  }

  async sendOutreach(actor: RevenueActor, id: string) {
    const state = await this.authorizedOwner(actor, id)
    if (!['APPROVED', 'RETRY_WAIT'].includes(state.lifecycle) || state.review?.decision !== 'APPROVE') throw new RevenueWorkflowError('APPROVAL_REQUIRED', 'Approved human review is required', 409)
    if (state.lifecycle === 'RETRY_WAIT' && state.retryAt && this.clock() < new Date(state.retryAt)) throw new RevenueWorkflowError('RETRY_NOT_DUE', 'Retry time has not arrived', 409)
    if (await this.repository.isSuppressed(state.firmId, state.normalizedEmail)) throw new RevenueWorkflowError('SUPPRESSED', 'Recipient is suppressed', 409)
    const privacy = await this.evaluatePrivacy(state)
    if (privacy.suppressed === true) return this.suppress(actor, state, 'PROVIDER_SUPPRESSION', privacy)
    this.validatePrivacy(state, privacy); state.privacy = privacy
    state.deliverability = await this.evaluateDeliverability(state)
    if (state.review.manifestHash !== this.manifest(state, String(state.review.subject), String(state.review.body))) throw new RevenueWorkflowError('APPROVAL_STALE', 'Consent, content, or data changed after approval', 409)
    const count = await this.repository.recentDeliveryCount(state.firmId, new Date(this.clock().getTime() - 3_600_000))
    if (count >= this.hourlyLimit) throw new RevenueWorkflowError('FIRM_RATE_LIMIT', 'Firm outreach rate limit reached', 429)
    const attempts = Number(state.outreach?.attempts ?? 0) + 1
    const idempotencyKey = String(state.outreach?.idempotencyKey ?? `outreach:${state.id}:${state.review.contentHash}`)
    try {
      const result = await this.providers.email.send({
        to: state.normalizedEmail, subject: state.review.subject, body: state.review.body, prospectId: state.id,
        consentReference: privacy.reference, reviewManifestHash: state.review.manifestHash, idempotencyKey,
      })
      this.evidence('email', result)
      if (typeof result.acceptedAt !== 'string' || typeof result.contentHash !== 'string' || result.contentHash !== state.review.contentHash) {
        throw new RevenueWorkflowError('EMAIL_EVIDENCE_INVALID', 'Email provider did not confirm the reviewed content digest', 502)
      }
      this.pastDate('acceptedAt', result.acceptedAt)
      state.outreach = { provider: result.provider, reference: result.reference, acceptedAt: result.acceptedAt, contentHash: result.contentHash, idempotencyKey, attempts, status: 'SENT' }
      state.retryAt = null; state.lifecycle = 'OUTREACH_SENT'
      return this.save(state, actor, 'OUTREACH_SENT', { provider: result.provider, reference: result.reference, contentHash: result.contentHash, consentReference: privacy.reference, idempotencyKey, sentAt: result.acceptedAt })
    } catch (error) {
      const retrySeconds = Math.max(60, Math.min(86_400, Number(error instanceof Error && 'retryAfterSeconds' in error ? (error as Error & { retryAfterSeconds: unknown }).retryAfterSeconds : 300) || 300))
      state.retryAt = new Date(this.clock().getTime() + retrySeconds * 1000).toISOString(); state.lifecycle = 'RETRY_WAIT'
      state.outreach = { idempotencyKey, attempts, status: 'FAILED', failureCode: error instanceof Error && 'code' in error ? String((error as Error & { code: unknown }).code) : 'EMAIL_PROVIDER_FAILURE' }
      return this.save(state, actor, 'OUTREACH_SEND_FAILED', { idempotencyKey, attempts, retryAt: state.retryAt, failureCode: state.outreach.failureCode })
    }
  }

  async verifyEngagement(actor: RevenueActor, id: string) {
    const state = await this.authorizedOwner(actor, id)
    if (state.lifecycle !== 'OUTREACH_SENT' || !state.outreach?.reference) throw new RevenueWorkflowError('OUTREACH_REQUIRED', 'Sent outreach is required', 409)
    const result = await this.providers.email.status({ reference: state.outreach.reference, prospectId: state.id, idempotencyKey: `email-status:${state.outreach.reference}` })
    this.evidence('email status', result)
    if (result.reference !== state.outreach.reference || result.status !== 'REPLIED' || typeof result.messageHash !== 'string' || !/^[a-f0-9]{64}$/i.test(result.messageHash)) {
      throw new RevenueWorkflowError('ENGAGEMENT_NOT_VERIFIED', 'Provider did not return verified recipient engagement', 409)
    }
    const occurredAt = this.pastDate('occurredAt', result.occurredAt)
    state.engagement = { provider: result.provider, reference: result.reference, messageHash: result.messageHash, occurredAt: occurredAt.toISOString() }
    state.lifecycle = 'ENGAGED'
    return this.save(state, actor, 'ENGAGEMENT_VERIFIED', state.engagement)
  }

  async handoff(actor: RevenueActor, id: string, startsAt: string) {
    const state = await this.authorizedOwner(actor, id)
    if (!['ENGAGED', 'HANDOFF_RETRY'].includes(state.lifecycle) || !state.engagement) throw new RevenueWorkflowError('ENGAGEMENT_REQUIRED', 'Verified engagement is required before handoff', 409)
    if (state.lifecycle === 'HANDOFF_RETRY' && state.retryAt && this.clock() < new Date(state.retryAt)) throw new RevenueWorkflowError('RETRY_NOT_DUE', 'Handoff retry time has not arrived', 409)
    const start = new Date(startsAt); if (Number.isNaN(start.getTime()) || start <= this.clock()) throw new RevenueWorkflowError('INVALID_HANDOFF_TIME', 'Handoff time must be in the future', 422)
    const idempotencyKey = `handoff:${state.id}:${state.engagement.messageHash}`
    try {
      const calendar = await this.providers.calendar.upsert({ prospectId: state.id, ownerId: state.ownerId, email: state.normalizedEmail, startsAt: start.toISOString(), idempotencyKey })
      this.evidence('calendar', calendar)
      const crm = await this.providers.crm.push({ operation: 'UPSERT_ACCOUNT', prospectId: state.id, ownerId: state.ownerId, email: state.normalizedEmail, company: state.company, attribution: state.attribution, calendarReference: calendar.reference, idempotencyKey })
      this.evidence('crm', crm)
      if (typeof crm.externalAccountId !== 'string') throw new RevenueWorkflowError('CRM_HANDOFF_INVALID', 'CRM returned no account identity', 502)
      state.handoff = { calendarProvider: calendar.provider, calendarReference: calendar.reference, crmProvider: crm.provider, crmReference: crm.reference, externalAccountId: crm.externalAccountId, startsAt: start.toISOString(), idempotencyKey }
      state.lifecycle = 'HANDED_OFF'; state.retryAt = null
      return this.save(state, actor, 'HANDOFF_COMPLETED', { ...state.handoff, displayName: this.displayName(state), email: state.normalizedEmail, company: state.company })
    } catch (error) {
      state.lifecycle = 'HANDOFF_RETRY'; state.retryAt = new Date(this.clock().getTime() + 300_000).toISOString()
      state.handoff = { idempotencyKey, failureCode: error instanceof Error && 'code' in error ? String((error as Error & { code: unknown }).code) : 'HANDOFF_PROVIDER_FAILURE', attempts: Number(state.handoff?.attempts ?? 0) + 1 }
      return this.save(state, actor, 'HANDOFF_FAILED', { ...state.handoff, retryAt: state.retryAt })
    }
  }

  async optOut(actor: RevenueActor, id: string, reason: string) {
    const state = await this.authorized(actor, id); reason = this.text('reason', reason, 500)
    let evidence: Record<string, unknown> = { provider: 'local', reference: `local:${state.id}`, occurredAt: this.clock().toISOString() }
    try {
      const result = await this.providers.privacy.recordOptOut({ email: state.normalizedEmail, reason, occurredAt: this.clock().toISOString(), idempotencyKey: `optout:${state.firmId}:${revenueHash(state.normalizedEmail)}` })
      this.evidence('privacy', result); evidence = result
    } catch (error) {
      evidence = { ...evidence, propagationStatus: 'RETRY_REQUIRED', failureCode: error instanceof Error && 'code' in error ? String((error as Error & { code: unknown }).code) : 'PRIVACY_PROVIDER_FAILURE' }
    }
    return this.suppress(actor, state, reason, evidence)
  }

  async syncOutbound(actor: RevenueActor, id: string) {
    const state = await this.authorized(actor, id)
    if (state.sync.status === 'RETRY_WAIT' && state.retryAt && this.clock() < new Date(state.retryAt)) throw new RevenueWorkflowError('RETRY_NOT_DUE', 'CRM retry time has not arrived', 409)
    const snapshotHash = revenueHash(canonicalRevenue(this.crmSnapshot(state))); const attempts = Number(state.sync.attempts ?? 0) + 1
    try {
      const result = await this.providers.crm.push({ operation: 'UPSERT_PROSPECT', snapshot: this.crmSnapshot(state), snapshotHash, idempotencyKey: `crm-push:${state.id}:${state.version}` })
      this.evidence('crm', result)
      state.externalIdentity = { provider: String(result.provider), externalId: this.text('externalId', result.externalId ?? state.externalIdentity?.externalId, 200), externalVersion: this.optional(result.externalVersion, 100) || null }
      state.sync = { status: 'SYNCED', attempts, lastOutboundAt: this.clock().toISOString(), provider: result.provider, reference: result.reference, snapshotHash }
      state.retryAt = null
      return this.save(state, actor, 'CRM_OUTBOUND_SYNCED', { provider: result.provider, reference: result.reference, snapshotHash, attempts }, false)
    } catch (error) {
      state.sync = { status: 'RETRY_WAIT', attempts, failureCode: error instanceof Error && 'code' in error ? String((error as Error & { code: unknown }).code) : 'CRM_PROVIDER_FAILURE', snapshotHash }
      state.retryAt = new Date(this.clock().getTime() + 300_000).toISOString()
      return this.save(state, actor, 'CRM_OUTBOUND_SYNC_FAILED', { ...state.sync, retryAt: state.retryAt }, false)
    }
  }

  async view(actor: RevenueActor, id: string) {
    const state = await this.authorized(actor, id); state.audit = await this.repository.auditEvents(id); return state
  }
  async list(actor: RevenueActor) {
    this.actor(actor)
    const states = await this.repository.list(actor.firmId)
    return (await this.repository.canManage(actor)) ? states : states.filter((state) => state.ownerId === actor.userId)
  }
  async metrics(actor: RevenueActor) { await this.manager(actor); return this.repository.metrics(actor.firmId) }

  private async suppress(actor: RevenueActor, state: RevenueState, reason: string, evidence: Record<string, unknown>) {
    const occurredAt = typeof evidence.occurredAt === 'string' ? evidence.occurredAt : this.clock().toISOString()
    await this.repository.recordSuppression(state.firmId, state.normalizedEmail, { reason, source: evidence.provider ?? 'local', externalReference: evidence.reference ?? null, occurredAt })
    state.privacy = { ...evidence, suppressed: true }; state.lifecycle = 'SUPPRESSED'; state.retryAt = null
    return this.save(state, actor, 'SUPPRESSION_RECORDED', { reason, source: evidence.provider ?? 'local', externalReference: evidence.reference ?? null, occurredAt, emailHash: revenueHash(state.normalizedEmail) })
  }

  private async evaluatePrivacy(state: RevenueState) {
    const result = await this.providers.privacy.evaluate({ email: state.normalizedEmail, region: state.region, purpose: 'B2B_OUTREACH', idempotencyKey: `privacy:${state.id}:${state.region}` })
    this.evidence('privacy', result)
    if (result.email !== state.normalizedEmail || String(result.region).toUpperCase() !== state.region || typeof result.checkedAt !== 'string' || typeof result.policyVersion !== 'string') {
      throw new RevenueWorkflowError('PRIVACY_EVIDENCE_INVALID', 'Consent/suppression response does not match this prospect', 502)
    }
    const checked = this.pastDate('checkedAt', result.checkedAt)
    if (this.clock().getTime() - checked.getTime() > 86_400_000) throw new RevenueWorkflowError('PRIVACY_EVIDENCE_STALE', 'Consent/suppression evidence is stale', 422)
    return result
  }

  private validatePrivacy(state: RevenueState, result: Record<string, unknown>) {
    if (result.suppressed === true) throw new RevenueWorkflowError('SUPPRESSED', 'Recipient is suppressed', 409)
    const consent = String(result.consentStatus ?? '')
    const lawfulBasis = String(result.lawfulBasis ?? '')
    if (RevenueOperationsWorkflow.EXPLICIT_CONSENT_REGIONS.has(state.region)) {
      if (consent !== 'GRANTED' || lawfulBasis !== 'CONSENT') throw new RevenueWorkflowError('EXPLICIT_CONSENT_REQUIRED', 'Explicit regional consent is required', 422)
    } else if (!['GRANTED', 'NOT_REQUIRED'].includes(consent) || !['CONSENT', 'LEGITIMATE_INTEREST', 'CONTRACT'].includes(lawfulBasis)) {
      throw new RevenueWorkflowError('LAWFUL_BASIS_REQUIRED', 'A verified lawful basis is required', 422)
    }
  }

  private async evaluateDeliverability(state: RevenueState) {
    const result = await this.providers.email.preflight({ email: state.normalizedEmail, region: state.region, idempotencyKey: `preflight:${state.id}:${revenueHash(state.normalizedEmail)}` })
    this.evidence('email preflight', result)
    if (result.email !== state.normalizedEmail || typeof result.checkedAt !== 'string') throw new RevenueWorkflowError('DELIVERABILITY_EVIDENCE_INVALID', 'Deliverability evidence does not match this prospect', 502)
    const checked = this.pastDate('checkedAt', result.checkedAt)
    if (this.clock().getTime() - checked.getTime() > 3_600_000) throw new RevenueWorkflowError('DELIVERABILITY_EVIDENCE_STALE', 'Deliverability evidence is stale', 422)
    if (result.status !== 'DELIVERABLE' || Number(result.score) < 0.8 || result.authenticatedDomain !== true) throw new RevenueWorkflowError('DELIVERABILITY_BLOCKED', 'Deliverability and authenticated-domain checks must pass', 422)
    return result
  }

  private manifest(state: RevenueState, subject: string, body: string) {
    return revenueHash(canonicalRevenue({
      email: state.normalizedEmail, givenName: state.givenName, familyName: state.familyName, company: state.company, region: state.region,
      subject, bodyHash: revenueHash(body), privacy: { status: state.privacy?.consentStatus, lawfulBasis: state.privacy?.lawfulBasis, policyVersion: state.privacy?.policyVersion, suppressed: state.privacy?.suppressed },
      deliverability: { status: state.deliverability?.status, score: state.deliverability?.score, authenticatedDomain: state.deliverability?.authenticatedDomain },
    }))
  }

  private quality(state: RevenueState) {
    const fields: Array<[string, unknown]> = [['email', state.normalizedEmail], ['givenName', state.givenName], ['familyName', state.familyName], ['company', state.company], ['region', state.region], ['source', state.attribution.source], ['owner', state.ownerId], ['enrichment', state.enrichment]]
    const missing = fields.filter(([, value]) => !value).map(([name]) => name)
    return { score: Math.round(((fields.length - missing.length) / fields.length) * 100), missing }
  }

  private crmSnapshot(state: RevenueState) {
    return { id: state.id, email: state.normalizedEmail, givenName: state.givenName, familyName: state.familyName, company: state.company, region: state.region, lifecycle: state.lifecycle, ownerId: state.ownerId, attribution: state.attribution, dataQuality: state.dataQuality, linkedClientId: state.handoff?.linkedClientId ?? null }
  }
  private displayName(state: RevenueState) { return state.company || `${state.givenName} ${state.familyName}`.trim() || state.normalizedEmail }

  private async save(state: RevenueState, actor: RevenueActor, action: string, payload: Record<string, unknown>, markSync = true) {
    if (markSync) state.sync = { ...state.sync, status: 'PENDING', attempts: Number(state.sync.attempts ?? 0) }
    return this.repository.mutate(state.id, state.version, state, actor, action, payload)
  }
  private async authorizedOwner(actor: RevenueActor, id: string) {
    const state = await this.authorized(actor, id)
    if (actor.userId !== state.ownerId) throw new RevenueWorkflowError('OWNER_REQUIRED', 'Assigned owner must perform this transition', 403)
    return state
  }
  private async authorized(actor: RevenueActor, id: string) {
    this.actor(actor); const state = await this.repository.load(this.text('id', id, 100))
    const canManage = await this.repository.canManage(actor)
    if (!state || state.firmId !== actor.firmId || (state.ownerId !== actor.userId && !canManage)) throw new RevenueWorkflowError('PROSPECT_NOT_FOUND', 'Prospect not found', 404)
    return state
  }
  private async manager(actor: RevenueActor) { this.actor(actor); if (!(await this.repository.canManage(actor))) throw new RevenueWorkflowError('MANAGER_REQUIRED', 'Partner or admin approval is required', 403) }
  private actor(actor: RevenueActor) { if (!actor.userId || !actor.firmId || !['ADMIN', 'PARTNER', 'ATTORNEY', 'PARALEGAL', 'SECRETARY', 'BOOKKEEPER'].includes(actor.role)) throw new RevenueWorkflowError('INVALID_ACTOR', 'Valid firm identity is required', 401) }
  private evidence(name: string, result: Record<string, unknown>) { if (!result || typeof result.provider !== 'string' || typeof result.reference !== 'string') throw new RevenueWorkflowError('PROVIDER_EVIDENCE_INVALID', `${name} provider returned no provenance`, 502) }
  private text(name: string, value: unknown, max: number) { if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new RevenueWorkflowError('INVALID_INPUT', `${name} is required and must be at most ${max} characters`, 422); return value.trim() }
  private optional(value: unknown, max: number) { if (value === null || value === undefined || value === '') return ''; if (typeof value !== 'string' || value.trim().length > max) throw new RevenueWorkflowError('INVALID_INPUT', `Value must be at most ${max} characters`, 422); return value.trim() }
  private email(value: unknown) { const email = this.text('email', value, 254).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RevenueWorkflowError('INVALID_EMAIL', 'Valid email is required', 422); return email }
  private pastDate(name: string, value: unknown) { const date = new Date(String(value)); if (Number.isNaN(date.getTime()) || date > this.clock()) throw new RevenueWorkflowError('INVALID_PROVIDER_DATE', `${name} is invalid`, 502); return date }
}
