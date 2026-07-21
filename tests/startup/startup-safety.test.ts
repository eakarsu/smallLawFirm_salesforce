import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const text = (path: string) => readFileSync(path, 'utf8')

test('runtime startup fails closed when required configuration is absent or weak', () => {
  const missing = spawnSync('bash', ['start.sh'], { encoding: 'utf8', env: { PATH: process.env.PATH || '', NODE_ENV: 'test' } })
  assert.notEqual(missing.status, 0); assert.match(missing.stderr, /DATABASE_URL is required/)
  const weak = spawnSync('bash', ['start.sh'], { encoding: 'utf8', env: { PATH: process.env.PATH || '', NODE_ENV: 'test', DATABASE_URL: 'postgresql://app:secret@db.example.com/app', NEXTAUTH_SECRET: 'short' } })
  assert.notEqual(weak.status, 0); assert.match(weak.stderr, /at least 32/)
})

test('runtime entrypoints do not install, build, migrate, seed, kill, or suppress failures', () => {
  for (const path of ['start.sh', 'docker-entrypoint.sh']) {
    const source = text(path)
    assert.doesNotMatch(source, /(^|\n)\s*(npm (install|ci)|npx prisma (migrate|db push|db seed)|kill -9|xargs kill)|\|\| true|\|\| echo/)
    assert.match(source, /set -e/)
  }
})

test('container uses external state, a non-root runtime, and no embedded database password', () => {
  const dockerfile = text('Dockerfile')
  assert.match(dockerfile, /USER node/); assert.match(dockerfile, /ENTRYPOINT/)
  assert.doesNotMatch(dockerfile, /postgresql-server|ALTER USER|createdb|db push|migrate deploy|password@127\.0\.0\.1/)
})

test('bootstrap seed is explicitly gated and contains no destructive cleanup or fixed password', () => {
  const seed = text('prisma/seed.ts')
  assert.match(seed, /ALLOW_BOOTSTRAP_SEED/); assert.match(seed, /BOOTSTRAP_ADMIN_PASSWORD/)
  assert.doesNotMatch(seed, /deleteMany|password123|console\.log\([^\n]*password/i)
})

test('backup scripts require explicit targets, custom format, checksum, and structural verification', () => {
  const backup = text('scripts/backup-database.sh'); const verify = text('scripts/verify-backup.sh')
  assert.match(backup, /--format=custom/); assert.match(backup, /umask 077/); assert.match(backup, /shasum -a 256/); assert.match(backup, /pg_restore --list/)
  assert.match(verify, /shasum -a 256 -c/); assert.match(verify, /pg_restore --list/)
  const invalid = spawnSync('bash', ['scripts/backup-database.sh', 'relative/path'], { encoding: 'utf8', env: { PATH: process.env.PATH || '', NODE_ENV: 'test', DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused' } })
  assert.equal(invalid.status, 2); assert.match(invalid.stderr, /absolute path/)
})
