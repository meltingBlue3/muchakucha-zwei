---
phase: 01-safe-account-entry
plan: 11
subsystem: api
tags: [nestjs-11, fastify-5, openapi, cors, throttling, nodemailer, mailpit]

requires:
  - phase: 01-safe-account-entry/01-10
    provides: Prisma 7 PostgreSQL 18 auth persistence and Nest-owned database lifecycle
  - phase: 01-safe-account-entry/01-02
    provides: Audited, pinned NestJS, Fastify, validation, throttling, and Nodemailer packages
provides:
  - Strict NestJS 11 and Fastify 5 application boundary under /api/v1
  - Exact-origin credentialed CORS, stable error envelopes, request correlation, redaction, validation, throttling, and OpenAPI JSON
  - Provider-neutral MailPort with SMTP/Mailpit adapter for verification, reset, and password-changed messages
  - AuthModule dependency-injection shell without registration or session behavior
affects: [01-12, 01-13, 01-16, 01-18, 01-19, 01-24, packages-api-client]

tech-stack:
  added: []
  patterns:
    - Fastify adapter configuration owns HTTP security and observability before route registration
    - Auth use cases depend on a symbol-bound MailPort while Nodemailer remains infrastructure
    - Production SMTP configuration fails before use while local development defaults to the pinned Mailpit ports

key-files:
  created:
    - apps/api/src/main.ts
    - apps/api/src/app.module.ts
    - apps/api/src/modules/auth/auth.module.ts
    - apps/api/src/infrastructure/mail/mail.port.ts
    - apps/api/src/infrastructure/mail/smtp-mail.adapter.ts
    - apps/api/src/infrastructure/mail/smtp-mail.adapter.test.ts
    - apps/api/test/bootstrap.int.test.ts
  modified:
    - apps/api/package.json
    - apps/api/tsconfig.json
    - apps/api/prisma.config.ts
    - pnpm-lock.yaml

key-decisions:
  - "Expose the Swagger/OpenAPI document as /api/v1/openapi.json without the optional static Swagger UI dependency."
  - "Accept credentialed browser requests only from exact configured origins and keep authentication state changes POST-only."
  - "Bind MailPort through a Nest symbol token and keep verification/reset links inside the SMTP transport payload, never application logs."
  - "Require complete authenticated SMTP inputs in production while local development targets Mailpit on the isolated test port."

patterns-established:
  - "API bootstrap: cookie registration precedes routes, then prefix/CORS/validation/errors/OpenAPI are installed before app initialization."
  - "Mail boundary: domain messages cross MailPort; SmtpMailAdapter alone owns Nodemailer configuration and message rendering."

requirements-completed: [AUTH-01, AUTH-02, AUTH-04, SAFE-03]

coverage:
  - id: D1
    description: "NestJS 11 boots on Fastify 5 under /api/v1 with Prisma, AuthModule, cookies, strict validation, exact-origin CORS, stable correlated errors, redacted logging, throttling, and OpenAPI JSON."
    requirement: AUTH-01
    verification:
      - kind: integration
        ref: "apps/api/test/bootstrap.int.test.ts#versioned Fastify application boundary (4 passed)"
        status: pass
      - kind: integration
        ref: "pnpm --filter api test --run --passWithNoTests=false (18 passed, downstream contracts skipped)"
        status: pass
    human_judgment: false
  - id: D2
    description: "MailPort expresses verification, reset, and password-changed messages while the Nodemailer adapter owns local Mailpit and fail-fast production SMTP configuration."
    requirement: AUTH-02
    verification:
      - kind: unit
        ref: "apps/api/src/infrastructure/mail/smtp-mail.adapter.test.ts#provider-neutral SMTP mail adapter (3 passed)"
        status: pass
      - kind: other
        ref: "docker compose config --images (axllent/mailpit:v1.30.0 retained)"
        status: pass
    human_judgment: false
  - id: D3
    description: "AuthModule exports a symbol-bound provider-neutral mail seam without implementing registration behavior owned by later plans."
    requirement: AUTH-04
    verification:
      - kind: integration
        ref: "apps/api/test/bootstrap.int.test.ts#boots Prisma, AuthModule, cookie parsing, throttling, and OpenAPI under /api/v1"
        status: pass
      - kind: other
        ref: "pnpm --filter api typecheck"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-08-01
status: complete
---

# Phase 01 Plan 11: Versioned Fastify and Mail Boundary Summary

**NestJS 11 now boots a strict `/api/v1` Fastify boundary, while AuthModule injects a provider-neutral Nodemailer SMTP adapter with local Mailpit defaults and fail-fast production configuration.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-01T04:35:29Z
- **Completed:** 2026-08-01T04:45:57Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Bootstrapped NestJS 11 on Fastify 5 with Prisma, an empty AuthModule shell, cookie support before routes, `/api/v1`, exact-origin credentialed CORS, strict DTO validation, a global throttle baseline, stable correlated errors, redacted logs, and OpenAPI JSON.
- Added executable boot coverage for the versioned spec, cookie plugin, dependency graph, CORS allowlist, error envelope, correlation IDs, and POST-only authentication mutations.
- Defined domain-owned verification, reset, and password-changed mail messages and bound them through `MAIL_PORT` to a Nodemailer SMTP adapter without importing SMTP details into any auth use case.
- Added local Mailpit defaults, complete production SMTP validation, header/URL/HTML hardening, and capture-transport tests that keep secret-bearing links confined to delivery payloads.

## Task Commits

Each task was committed atomically:

1. **Task 1: Bootstrap the versioned Fastify boundary** - `81ac778` (feat)
2. **Task 2: Establish MailPort and SMTP adapter** - `6fd2cbc` (feat)

## Files Created/Modified

- `apps/api/src/main.ts` - Fastify construction, runtime validation, cookie/CORS/validation/error/logging/OpenAPI configuration, and safe bootstrap.
- `apps/api/src/app.module.ts` - Prisma/Auth imports plus the global Nest throttler guard.
- `apps/api/src/modules/auth/auth.module.ts` - MailPort provider token binding only; no registration behavior.
- `apps/api/src/infrastructure/mail/mail.port.ts` - Domain-owned mail message and delivery contracts.
- `apps/api/src/infrastructure/mail/smtp-mail.adapter.ts` - Nodemailer SMTP/Mailpit configuration and hardened message rendering.
- `apps/api/src/infrastructure/mail/smtp-mail.adapter.test.ts` - Capture-transport and production configuration coverage.
- `apps/api/test/bootstrap.int.test.ts` - Migrated PostgreSQL-backed HTTP bootstrap assertions.
- `apps/api/package.json` / `pnpm-lock.yaml` - API ownership of previously approved Nest/Fastify/Nodemailer pins and typecheck script.
- `apps/api/tsconfig.json` - Nest decorator metadata under the strict shared TypeScript policy.
- `apps/api/prisma.config.ts` - Guarded local test datasource default so client generation can run before integration setup.

## Decisions Made

- Published raw OpenAPI JSON at `/api/v1/openapi.json`; the optional static Swagger UI was disabled because it requires an unapproved `@fastify/static` package and downstream client generation needs the JSON contract, not bundled UI assets.
- Authentication routes reject PUT/PATCH/DELETE at the Fastify boundary. Later non-auth business APIs remain free to use their planned REST methods.
- Request logs retain generated correlation IDs while token-bearing URL/header/body fields are redacted; unhandled errors log only the exception class, not its message or request payload.
- Mail links exist only in `sendMail` payloads. The AuthModule knows only `MAIL_PORT`, and later use cases remain responsible for committing token state before invoking it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made the API workspace own its bootstrap dependencies and typecheck command**

- **Found during:** Task 1 (Bootstrap the versioned Fastify boundary)
- **Issue:** The approved packages existed only in the root importer, the API had no `typecheck` script, and Nest decorator metadata was not enabled, so the exact plan command and strict dependency boundary were incomplete.
- **Fix:** Added the already-approved exact Nest/Fastify/validation pins to `apps/api`, enabled decorator metadata, and added the canonical typecheck script.
- **Files modified:** `apps/api/package.json`, `apps/api/tsconfig.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm --filter api typecheck` passes.
- **Committed in:** `81ac778`

**2. [Rule 3 - Blocking] Allowed Prisma client generation before database setup**

- **Found during:** Task 1 verification
- **Issue:** The API `pretest` runs `prisma generate`, but `prisma.config.ts` required `DATABASE_URL` before Vitest global setup could establish the guarded integration URL.
- **Fix:** Reused the reset harness's loopback, test-named datasource as the CLI default; runtime Prisma still requires `DATABASE_URL`, and explicit migration/test URLs override it.
- **Files modified:** `apps/api/prisma.config.ts`
- **Verification:** The exact typecheck/test sequence generates the client, migrates PostgreSQL 18, and passes 18 tests.
- **Committed in:** `81ac778`

---

**Total deviations:** 2 auto-fixed (2 blocking issues).
**Impact on plan:** Both changes make the planned commands reproducible and preserve strict production/runtime failure behavior; no registration, verification, reset, or session use case was added.

## Issues Encountered

- Docker Hub returned EOF for both pinned Compose images. The PostgreSQL test path used the existing local immutable image digest `sha256:9b5bd946f3a507db72c55959700e517463e8d5dbb6f7eb30d920d5bcf6951431` on isolated port 55442; its runtime reported PostgreSQL 18.2 and UTC, migrations applied, and all 18 API tests passed. The committed Compose pin remains `postgres:18.4-alpine3.24`.
- `axllent/mailpit:v1.30.0` was not cached and three Docker Hub attempts ended with EOF, so live Mailpit health could not be observed. The exact Compose pin remains unchanged; three capture-transport tests prove configuration, composition, secret confinement, and production fail-fast behavior without substituting a package or provider.

## User Setup Required

None - local development uses the committed Mailpit defaults; production SMTP provider selection remains the Phase 6 release gate.

## Known Stubs

- `apps/api/src/modules/auth/auth.module.ts` intentionally contains only the MailPort provider shell. Registration and all other auth behavior belong to later TDD plans and are not required for this plan's bootstrap/mail goal.

## Next Phase Readiness

- Registration plans can build controllers and transactional use cases on a boot-tested `/api/v1` boundary and call `MailPort` only after committed state.
- OpenAPI generation can consume `/api/v1/openapi.json` without importing Prisma types.
- Live Mailpit verification remains dependent on Docker Hub recovering or the exact pinned image becoming locally available; no code or configuration change is required.

## Self-Check: PASSED

- All seven created key files and four modified key files exist.
- Task commits `81ac778` and `6fd2cbc` exist in order with no tracked-file deletions.
- Strict TypeScript passes; mail unit tests pass 3/3; full API tests pass 18 with 61 downstream Wave 0 contracts intentionally skipped.
- Compose still resolves exactly `postgres:18.4-alpine3.24` and `axllent/mailpit:v1.30.0`.
- Stub/secret logging scan found no TODO/FIXME placeholders, raw token logging, localStorage, or AsyncStorage use in the changed boundary.

---
*Phase: 01-safe-account-entry*
*Completed: 2026-08-01*
