import assert from 'node:assert/strict'
import test from 'node:test'
import { createRevenueProviders, RevenueProviderConfigurationError, RevenueProviderRequestError } from '../../src/lib/revenue-operations-providers'

const names = [
  'REVENUE_CRM_URL', 'REVENUE_CRM_TOKEN', 'REVENUE_ENRICHMENT_URL', 'REVENUE_ENRICHMENT_TOKEN',
  'REVENUE_PRIVACY_URL', 'REVENUE_PRIVACY_TOKEN', 'REVENUE_EMAIL_URL', 'REVENUE_EMAIL_TOKEN',
  'REVENUE_CALENDAR_URL', 'REVENUE_CALENDAR_TOKEN',
]
const originalFetch = globalThis.fetch

function configured() {
  for (let index = 0; index < names.length; index += 2) {
    process.env[names[index]] = `https://${names[index].toLowerCase().replaceAll('_', '-')}.example.com/base/`
    process.env[names[index + 1]] = 'provider-token-longer-than-sixteen'
  }
}

test.afterEach(() => { for (const name of names) delete process.env[name]; globalThis.fetch = originalFetch })

test('provider configuration is lazy and rejects non-HTTPS endpoints', async () => {
  const providers = createRevenueProviders()
  process.env.REVENUE_CRM_URL = 'http://crm.example.com'; process.env.REVENUE_CRM_TOKEN = 'provider-token-longer-than-sixteen'
  await assert.rejects(() => providers.crm.pull({ idempotencyKey: 'pull-1' }), RevenueProviderConfigurationError)
})

test('adapter sends bearer identity, JSON, and idempotency evidence to the expected endpoint', async () => {
  configured(); let captured: { url: string; init?: RequestInit } | null = null
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    captured = { url: String(url), init }
    return new Response(JSON.stringify({ provider: 'crm', reference: 'r-1', records: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  const value = await createRevenueProviders().crm.pull({ cursor: null, idempotencyKey: 'pull-firm-1' })
  assert.equal(value.reference, 'r-1')
  assert.equal(captured!.url, 'https://revenue-crm-url.example.com/v1/prospects/pull')
  const headers = new Headers(captured!.init?.headers)
  assert.equal(headers.get('authorization'), 'Bearer provider-token-longer-than-sixteen')
  assert.equal(headers.get('idempotency-key'), 'pull-firm-1')
  assert.deepEqual(JSON.parse(String(captured!.init?.body)), { cursor: null, idempotencyKey: 'pull-firm-1' })
})

test('adapter bounds provider Retry-After evidence on rejected requests', async () => {
  configured()
  globalThis.fetch = (async () => new Response('{}', { status: 429, headers: { 'retry-after': '999999' } })) as typeof fetch
  await assert.rejects(() => createRevenueProviders().email.send({ idempotencyKey: 'm-1' }), (error: unknown) => error instanceof RevenueProviderRequestError && error.code === 'EMAIL_429' && error.retryAfterSeconds === 86_400)
})

test('adapter rejects successful responses that are not JSON objects', async () => {
  configured()
  globalThis.fetch = (async () => new Response('[]', { status: 200 })) as typeof fetch
  await assert.rejects(() => createRevenueProviders().privacy.evaluate({ idempotencyKey: 'p-1' }), (error: unknown) => error instanceof RevenueProviderRequestError && error.code === 'PRIVACY_INVALID_RESPONSE')
})
