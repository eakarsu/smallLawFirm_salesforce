import type { RevenueProviders } from './revenue-operations-workflow'

export class RevenueProviderConfigurationError extends Error {
  readonly code = 'PROVIDER_CONFIGURATION'
}

export class RevenueProviderRequestError extends Error {
  constructor(message: string, readonly code = 'PROVIDER_REQUEST_FAILED', readonly retryAfterSeconds = 300) { super(message) }
}

function configuration(urlName: string, tokenName: string) {
  const rawUrl = process.env[urlName]?.trim(); const token = process.env[tokenName]?.trim()
  if (!rawUrl || !token || token.length < 16 || /^(replace|your-|change-me|example)/i.test(token)) throw new RevenueProviderConfigurationError(`${urlName} and ${tokenName} are required and must not be placeholders`)
  const url = new URL(rawUrl)
  if (url.protocol !== 'https:') throw new RevenueProviderConfigurationError(`${urlName} must use HTTPS`)
  return { url, token }
}

class JsonProvider {
  constructor(private readonly name: string, private readonly urlName: string, private readonly tokenName: string) {}

  async post(path: string, body: Record<string, unknown>) {
    const { url, token } = configuration(this.urlName, this.tokenName)
    let response: Response
    try {
      response = await fetch(new URL(path, url), {
        method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(15_000),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '' },
        body: JSON.stringify(body),
      })
    } catch {
      throw new RevenueProviderRequestError(`${this.name} provider was unavailable`)
    }
    if (!response.ok) {
      const retryAfter = Math.max(60, Math.min(86_400, Number(response.headers.get('retry-after')) || 300))
      throw new RevenueProviderRequestError(`${this.name} provider rejected the request`, `${this.name.toUpperCase()}_${response.status}`, retryAfter)
    }
    const value: unknown = await response.json().catch(() => null)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RevenueProviderRequestError(`${this.name} provider returned invalid JSON`, `${this.name.toUpperCase()}_INVALID_RESPONSE`)
    return value as Record<string, unknown>
  }
}

export function createRevenueProviders(): RevenueProviders {
  const crm = new JsonProvider('crm', 'REVENUE_CRM_URL', 'REVENUE_CRM_TOKEN')
  const enrichment = new JsonProvider('enrichment', 'REVENUE_ENRICHMENT_URL', 'REVENUE_ENRICHMENT_TOKEN')
  const privacy = new JsonProvider('privacy', 'REVENUE_PRIVACY_URL', 'REVENUE_PRIVACY_TOKEN')
  const email = new JsonProvider('email', 'REVENUE_EMAIL_URL', 'REVENUE_EMAIL_TOKEN')
  const calendar = new JsonProvider('calendar', 'REVENUE_CALENDAR_URL', 'REVENUE_CALENDAR_TOKEN')
  return {
    crm: { pull: (value) => crm.post('/v1/prospects/pull', value), push: (value) => crm.post('/v1/prospects/push', value) },
    enrichment: { lookup: (value) => enrichment.post('/v1/enrichment/lookup', value) },
    privacy: { evaluate: (value) => privacy.post('/v1/privacy/evaluate', value), recordOptOut: (value) => privacy.post('/v1/privacy/opt-outs', value) },
    email: { preflight: (value) => email.post('/v1/deliverability/preflight', value), send: (value) => email.post('/v1/messages', value), status: (value) => email.post('/v1/messages/status', value) },
    calendar: { upsert: (value) => calendar.post('/v1/events/upsert', value) },
  }
}
