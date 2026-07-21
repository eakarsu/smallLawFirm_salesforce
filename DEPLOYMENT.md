# GetFirmFlow deployment runbook

GetFirmFlow requires an externally managed PostgreSQL database and HTTPS provider gateways. Runtime startup is intentionally read-only with respect to source, dependencies, schema, seed data, and other processes.

## Release sequence

1. Copy `.env.example` into the deployment platform and replace every required placeholder with a secret/runtime value. Never commit the resulting environment file.
2. Run `npm ci`, `npm run verify`, and `npm run build` in CI.
3. Back up the target database: `DATABASE_URL=... BACKUP_DATABASE_URL=... ./scripts/backup-database.sh /absolute/protected/backup/path`. `BACKUP_DATABASE_URL` may be omitted when the main URL is accepted directly by `pg_dump`; use it when the Prisma URL contains client-only parameters such as `schema`.
4. Verify the output: `./scripts/verify-backup.sh /absolute/protected/backup/path/getfirmflow-....dump`.
5. Run schema changes as an explicit release job: `DATABASE_URL=... ./scripts/release-migrate.sh`.
6. Deploy the already-built artifact and run `./start.sh`, or build and run the Docker image. Startup does not install, build, migrate, seed, kill ports, or hide failures.
7. Check `/api/health`, authenticate, and perform a provider preflight before enabling operator traffic.

Run the migration job once per release. `prisma migrate deploy` is safe to invoke again and reports already-applied migrations without replaying them.

## Controlled bootstrap

There is no public role-bearing registration. For an empty database only, provide all `BOOTSTRAP_*` values, set `ALLOW_BOOTSTRAP_SEED=true`, and run `npm run prisma:seed` manually. The seed refuses to delete data, refuses weak passwords, refuses an existing administrator identity, and never prints credentials. Turn the flag off immediately afterward.

## Revenue provider contract

All `REVENUE_*_URL` values must use HTTPS and all tokens must contain at least 16 characters. The app requires provenance (`provider` and `reference`) for every provider decision. Email delivery additionally requires a digest of the human-reviewed content. Privacy is reevaluated immediately before send, regional consent is enforced, and opt-outs are written locally even if external propagation fails.

## Recovery exercise

At least quarterly, verify a recent backup and restore it into an isolated empty database:

```bash
createdb getfirmflow_restore_test
pg_restore --no-owner --no-privileges --dbname postgresql://.../getfirmflow_restore_test /protected/path/getfirmflow-....dump
psql postgresql://.../getfirmflow_restore_test -c 'SELECT COUNT(*) FROM "RevenueAuditEvent";'
dropdb getfirmflow_restore_test
```

Use unique, explicitly named test databases and confirm their identity before removal. Never restore over the production database.

## Rollback

Application rollback uses the previous immutable image. Prisma migrations in this repository are forward-only; do not improvise a destructive schema rollback. If a release must be reversed, stop writes, preserve a fresh backup, deploy the prior image if schema-compatible, and use a reviewed forward repair migration. A point-in-time database restore is an incident procedure and requires an explicitly approved recovery point.
