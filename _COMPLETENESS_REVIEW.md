# Completeness Review: smallLawFirm_salesforce

**Review date:** 2026-07-18

## Assessment basis

Static inspection of project-owned source and configuration only; no dependency installation, build, database migration, external-service call, or runtime launch was performed. The scan considered 237 project files (210 source files), 1 manifest(s), 0 test-like file(s), and 0 CI workflow(s), excluding dependency/generated directories.

## Classification

**Functional but incomplete**

This is a substantive but unfinished sales/customer operations application, not just an empty scaffold. Inspection found 210 source files across `src/`, `prisma/`, `nginx/` using Next.js, React, Prisma; however, the checked-in workflow and delivery controls do not yet demonstrate a complete, production-operable product.

## Why it is not complete

- Generated gap/visualization routes describe missing capabilities or simulate recommendations; they do not implement the underlying domain operation.
- Generic LLM calls are used as product behavior without enough typed tools, grounded evidence, deterministic rules, or output evaluation.
- Mock, demo, sample, fixture, or placeholder behavior remains in executable/product paths.
- No recognizable project-owned automated tests were found for the main workflow.
- No checked-in CI workflow proves builds, tests, migrations, and security checks on every change.

## Needed features

1. Integrate CRM, email/calendar, enrichment, consent, and suppression sources with bidirectional, deduplicated sync.
2. Implement explicit lead/account lifecycle, ownership, approvals, attribution, and handoff/retry states.
3. Add deliverability, opt-out, regional privacy, rate-limit, and human-review controls for automated outreach.
4. Measure conversion and data quality with representative end-to-end workflow tests rather than generated sample records.
5. Add risk-based unit, integration, and end-to-end tests in CI, including migration and failure-path coverage.

## Risks or launch blockers

- Weak/fallback secret patterns can permit forged sessions or accidental insecure deployments.
- Automation contains destructive process, filesystem, or database operations; do not run it on a shared machine without review.
- Startup appears coupled to seed/migration behavior, risking data mutation or non-repeatable launches.
- AI-provider availability, cost, privacy, prompt injection, and unvalidated output are launch risks until bounded and evaluated.

## Evidence inspected

- `DEPLOYMENT.md:18`
- `src/components/GapFeaturePage.tsx:7`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `package.json`
- `start.sh`

## Recommended next action

Choose one real sales/customer operations journey, define acceptance criteria and external contracts, then close its persistence, permission, integration, failure, and test gaps before expanding features.

## Implementation progress (2026-07-20)

The repository implementation for every numbered item in this review is complete. Production activation still depends on the explicitly listed external gates below; no mock provider or fallback-secret path is used when those integrations are absent.

### 1. Bidirectional, deduplicated provider sync

- Added a persisted revenue-operations domain with firm-scoped prospect identity, attribution touches, provider identities and versions, suppression records, immutable delivery evidence, and hash-chained audit events.
- Added HTTPS JSON adapters for CRM, enrichment, privacy/consent, email, and calendar gateways. Adapters require non-placeholder bearer credentials, provider provenance, bounded timeouts, validated JSON responses, and stable idempotency keys.
- CRM inbound batches deduplicate by firm/email and CRM identity while retaining attribution. Outbound prospect/account updates and calendar handoffs have explicit provider references and retry state.
- Local opt-out is fail-closed and remains effective if external suppression propagation fails. Provider suppression is imported before review/send.

### 2. Lifecycle, ownership, approval, attribution, handoff, and retry

- Added explicit prospect lifecycle and retry state for enrichment, review preparation, outreach delivery, CRM updates, engagement verification, calendar handoff, account/client conversion, failure, and suppression.
- Only the assigned active owner may operate a prospect. Approval requires a different active manager and is bound to the reviewed content/privacy manifest digest.
- Verified reply evidence is required before account/client handoff. The handoff creates a real tenant-scoped `Client`, then records CRM account and calendar identities.
- Repository mutations use PostgreSQL advisory locks plus optimistic versions, so concurrent stale transitions fail instead of overwriting state.

### 3. Outreach safeguards

- Review preparation and send both require fresh privacy evidence; EEA/EU/UK/CA outreach requires explicit consent.
- Review requires fresh deliverability evidence for the exact address, an authenticated sending domain, and a score of at least 0.8. Send rechecks privacy and deliverability rather than trusting stale approval state.
- Added per-firm hourly delivery limits, independent human review, owner-only delivery, provider retry bounds, durable delivery evidence, and append-only suppression/audit records.
- Public role-bearing registration is disabled. Authentication now rejects weak/placeholder secrets, refreshes active role/firm state, limits login attempts, uses eight-hour sessions, and stores reset/verification tokens only as SHA-256 digests. Password policy is 12+ characters with all character classes and common-password rejection.

### 4. Metrics and representative workflow

- Added persisted funnel conversion, suppression, deduplication, lifecycle, and data-quality metrics, with firm-manager-only aggregate access and tenant-scoped prospect visibility.
- Added a representative end-to-end test covering CRM ingestion, ownership, enrichment provenance, privacy and deliverability preflight, independent approval, exact-content delivery, verified engagement, and CRM/calendar/client handoff.
- Removed executable gap/demo routes, generic AI product behavior, fake calendar/portal/website operations, demo credentials, and unsupported product/marketing claims rather than presenting generated examples as completed capabilities.

### 5. Risk-based tests and CI

- Added 34 passing automated tests: 24 unit, 5 startup/deployment safety, 4 PostgreSQL integration, and 1 representative end-to-end test. Failure coverage includes stale versions, concurrent transitions, privacy/consent rejection, stale or mismatched deliverability, suppression propagation failure, provider retry state, independent review, rate limits, and immutable evidence mutation/deletion.
- Added CI for a clean install, Prisma generation/validation, two consecutive migration deployments, typecheck, lint, unit/startup/integration/end-to-end tests, optimized production build, production dependency audit, database backup/restore, and full-history secret scanning.
- Added forward-only migrations for the governed revenue domain and pre-existing client-portal schema drift. A fresh PostgreSQL database applied all four project migrations; the second deployment reported no pending migration, and migration-to-schema diff reported no difference.

### Launch-risk remediation

- Startup and the container entrypoint now validate configuration and start only an already-installed, already-built artifact. They do not install, build, migrate, seed, delete, or kill another process. A second start on an occupied port fails without disturbing the running server.
- Bootstrap seeding is explicit, one-time, non-destructive, strong-password gated, and never invoked by startup. Public self-registration cannot create a firm or privileged user.
- Database backup uses PostgreSQL custom format, restrictive permissions, structural verification, and SHA-256 evidence. An isolated verification restored 14 immutable revenue audit events.
- Transactional reset, verification, and invoice delivery now uses required TLS-capable SMTP configuration and records invoice delivery only after provider acceptance.
- Generic LLM routes and claims were retired; the completed workflow is deterministic and provider evidence is typed and validated.

### Verification evidence

- `npm ci`, typecheck, zero-warning lint, and the optimized Next.js production build passed (74 generated routes).
- Runtime smoke: health `200`, unauthenticated revenue access `401`, public registration `403`, retired AI route `404`, and occupied-port second start rejected while the first process remained healthy.
- Production dependency audit: **0 vulnerabilities** after forcing Next's nested PostCSS to the patched direct version; the low-threshold gate passes without an invalid dependency tree.
- Gitleaks: 0 findings across all 6 repository commits and 0 findings in the current pruned working tree. One historical placeholder curl header in a removed marketing-documentation page is fingerprint-ignored, not a credential.
- Fresh PostgreSQL integration: 4/4 tests passed, schema drift was empty, repeat migration was a no-op, backup checksum/structure passed, and isolated restore succeeded.
- Independent handoff verification repeated clean install, all four migrations plus no-op replay and zero schema drift, typecheck, zero-warning lint, all **34 tests**, the 74-route Next.js build, the zero-finding low-threshold production audit, diff, and configured current/six-commit Gitleaks. CI database/auth material is now per-run and the application job fetches full history.

### External production gates

- Provision a managed PostgreSQL database, run the explicit release migration job, choose a protected backup destination/custodian, and complete an operator-owned restore drill.
- Supply production HTTPS endpoints and credentials for all five CRM, enrichment, privacy, email, and calendar gateways, and validate their contracts with real sandbox/provider accounts.
- Supply SMTP credentials, a production HTTPS `NEXTAUTH_URL`, a unique random `NEXTAUTH_SECRET`, an operator support address, and deployment-specific origin/TLS controls.
- The operating law firm must approve its regional consent/lawful-basis policy, retention and suppression policy, human-review staffing, delivery limit, incident response, and binding privacy/commercial terms. These organizational and provider decisions cannot be completed inside this repository.

## Runtime acceptance refresh (2026-07-20)

- The isolated validator used the project's unique PostgreSQL/API/UI ports `55699`/`6198`/`6199`. `start.sh` launched the existing optimized production artifact, and the explicit bootstrap command created dynamic firm-administrator credentials without logging them.
- The NextAuth credentials exchange returned `200`; session and authenticated API checks passed with `startup_login_session_api`. All three listeners were released after validation.
- Type checking, all 24 unit tests, all 5 startup-safety tests, and the 74-page production build passed.
