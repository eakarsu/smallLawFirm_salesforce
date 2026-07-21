import assert from 'node:assert/strict'
import test from 'node:test'
import { applicationUrl, digestAuthToken, issueAuthToken } from '../../src/lib/auth-tokens'
import { validatePasswordStrength } from '../../src/lib/password-validation'

const mutableEnv = process.env as Record<string, string | undefined>
test.afterEach(() => { delete mutableEnv.NEXTAUTH_URL; delete mutableEnv.NODE_ENV })

test('one-time authentication tokens expose only an independent SHA-256 digest for persistence', () => {
  const first = issueAuthToken(); const second = issueAuthToken()
  assert.notEqual(first.raw, first.digest); assert.equal(first.digest, digestAuthToken(first.raw)); assert.match(first.digest, /^[a-f0-9]{64}$/)
  assert.notEqual(first.raw, second.raw); assert.notEqual(first.digest, second.digest)
})

test('production authentication links require HTTPS and preserve the token as a query parameter', () => {
  mutableEnv.NODE_ENV = 'production'; mutableEnv.NEXTAUTH_URL = 'http://firm.example.com'
  assert.throws(() => applicationUrl('/reset-password', 'token'), /HTTPS/)
  mutableEnv.NEXTAUTH_URL = 'https://firm.example.com/app/'
  assert.equal(applicationUrl('/reset-password', 'a+b/c'), 'https://firm.example.com/reset-password?token=a%2Bb%2Fc')
})

test('password policy requires length and all character classes and rejects common prefixes', () => {
  assert.equal(validatePasswordStrength('password123!A').isValid, false)
  assert.equal(validatePasswordStrength('Short1!').isValid, false)
  assert.equal(validatePasswordStrength('LongUnique1!Passphrase').isValid, true)
})
