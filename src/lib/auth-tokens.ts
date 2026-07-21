import { createHash, randomBytes } from 'node:crypto'

export function issueAuthToken() {
  const raw = randomBytes(32).toString('base64url')
  return { raw, digest: digestAuthToken(raw) }
}

export function digestAuthToken(raw: string) {
  return createHash('sha256').update(raw).digest('hex')
}

export function applicationUrl(path: string, token: string) {
  const configured = process.env.NEXTAUTH_URL?.trim()
  if (!configured) throw new Error('NEXTAUTH_URL is required for authentication email links')
  const base = new URL(configured)
  if (process.env.NODE_ENV === 'production' && base.protocol !== 'https:') throw new Error('NEXTAUTH_URL must use HTTPS in production')
  const url = new URL(path, base)
  url.searchParams.set('token', token)
  return url.toString()
}
