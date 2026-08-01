---
phase: 01-safe-account-entry
plan: 13
subsystem: auth
tags: [nestjs, fastify, prisma, argon2id, openapi, registration, httponly-cookie]

requires:
  - phase: 01-safe-account-entry/01-10
    provides: PostgreSQL 18 auth schema, canonical identity constraint, hash-only token columns, and Prisma transaction boundary
  - phase: 01-safe-account-entry/01-11
    provides: Versioned Nest/Fastify API, strict validation, throttling, OpenAPI endpoint, and provider-neutral MailPort
provides:
  - Secure POST /api/v1/auth/register with canonical identity, Argon2id, denylist, and transaction-safe creation
  - Registration-side D-06 pending proof delivered through native JSON or bounded HttpOnly Web cookie
  - Deterministic OpenAPI document and generated typed API client with an executable drift gate
affects: [01-15, 01-16, 01-17, packages-api-client, phase-02-household-handoff]

tech-stack:
  added: []
  patterns:
    - Registration performs the password KDF before canonical identity collision handling and always returns a generic accepted shape
    - Verification and continuation credentials are CSPRNG values persisted only as lowercase SHA-256 hashes
    - Generated API artifacts are produced from the live Nest OpenAPI document and checked for tracked or untracked drift

key-files:
  created:
    - apps/api/src/modules/auth/auth.controller.ts
    - apps/api/src/modules/auth/auth.service.ts
    - apps/api/src/modules/auth/dto/register.dto.ts
    - apps/api/src/modules/auth/password-policy.ts
    - apps/api/src/openapi/generate-openapi.ts
    - packages/api-client/openapi.json
    - packages/api-client/src/generated/client.ts
  modified:
    - apps/api/src/modules/auth/auth.module.ts
    - apps/api/src/main.ts
    - apps/api/test/auth/register.int.test.ts
    - apps/api/package.json
    - pnpm-lock.yaml

key-decisions:
  - "Issue a fresh opaque pending proof on every generic registration response, but persist it only when the canonical identity is newly created, preserving response shape without linking duplicate attempts to an account."
  - "Select the Web proof transport only for an explicitly declared Web request with an exact configured Origin; native requests must not carry a browser Origin."
  - "Start MailPort delivery after the user/token transaction commits and keep delivery latency outside the public 202 response path so canonical identity existence is not exposed through SMTP timing."
  - "Generate the typed client from the live Nest OpenAPI document and enforce drift with a cross-platform Node gate rather than a PowerShell-7-only runner."

patterns-established:
  - "Registration transaction: create User and EmailVerificationToken together; unique canonical collisions roll back and enter the same generic response path."
  - "D-06 registration transport: native receives a 32-byte base64url proof for SecureStore; Web receives only a narrow-path HttpOnly SameSite=Lax cookie."

requirements-completed: [AUTH-01, AUTH-02]

coverage:
  - id: D1
    description: "Registration enforces canonical identity, exact Unicode password length, all 3000 committed common-password entries, Argon2id, duplicate nickname support, and transaction-safe races."
    requirement: AUTH-01
    verification:
      - kind: integration
        ref: "apps/api/test/auth/register.int.test.ts#registration API contract and persistence contract (15 passed)"
        status: pass
      - kind: integration
        ref: "pnpm --filter api test --run --passWithNoTests=false (26 passed; 55 downstream cases skipped)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Registration persists verification and pending credentials only as SHA-256 hashes, invokes MailPort after commit, and delivers the continuation proof through platform-safe transport."
    requirement: AUTH-02
    verification:
      - kind: integration
        ref: "apps/api/test/auth/register.int.test.ts#Web cookie, native proof, hash-only persistence, and post-commit mail cases"
        status: pass
    human_judgment: false
  - id: D3
    description: "The versioned registration contract generates deterministic OpenAPI JSON and a strict typed client with no Prisma coupling or drift."
    requirement: AUTH-01
    verification:
      - kind: other
        ref: "pnpm openapi:check"
        status: pass
      - kind: other
        ref: "pnpm --filter @muchakucha/api-client typecheck"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-08-01
status: complete
---

# Phase 01 Plan 13: Secure Registration and D-06 Continuation Proof Summary

**A transaction-safe `/api/v1/auth/register` now applies canonical identity and Argon2id policy while issuing hash-only verification state through SecureStore-ready native proof or a bounded HttpOnly Web cookie.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-01T04:59:19Z
- **Completed:** 2026-08-01T05:11:05Z
- **Tasks:** 2
- **Files modified:** 18

## Accomplishments

- Activated and passed 15 registration and persistence integration cases covering generic duplicate behavior, canonicalization, original email preservation, the full 3000-entry denylist, Argon2id parameters, transaction races, and duplicate nicknames.
- Implemented CSPRNG verification/pending values with SHA-256-only persistence and committed User plus EmailVerificationToken state in one Prisma transaction before invoking MailPort.
- Wired D-06 registration transport so native receives a SecureStore-ready proof while validated Web requests receive a narrow-path HttpOnly cookie and no proof-bearing JSON.
- Added deterministic Nest OpenAPI generation, a typed `@muchakucha/api-client` package, and a cross-platform drift gate.

## Task Commits

Each task was committed atomically:

1. **Task 1: Activate registration and pending-proof RED cases** - `30ff2ba` (test)
2. **Task 2: Implement registration and generated contract** - `fb4a8ac` (feat)
3. **Task 2 deviation: Make OpenAPI drift verification cross-platform** - `4cc7227` (fix)

## Files Created/Modified

- `apps/api/src/modules/auth/auth.controller.ts` - Versioned register endpoint, transport validation, throttling, and bounded Web cookie.
- `apps/api/src/modules/auth/auth.service.ts` - Canonical identity, Argon2id, opaque credentials, transaction, generic duplicate path, and post-commit MailPort dispatch.
- `apps/api/src/modules/auth/dto/register.dto.ts` - Strict Swagger-published registration request/response DTOs.
- `apps/api/src/modules/auth/password-policy.ts` - Exact Unicode length and committed top-3000 denylist policy.
- `apps/api/test/auth/register.int.test.ts` - Fifteen isolated HTTP and migrated-database security contracts.
- `apps/api/src/openapi/generate-openapi.ts` - Deterministic generator sourced from the live Nest document.
- `packages/api-client/openapi.json` and `packages/api-client/src/generated/*` - Versioned contract plus typed generated client.
- `scripts/check-openapi-drift.mjs` - Cross-platform tracked/untracked generation drift gate.

## Decisions Made

- Duplicate canonical registrations still pay the Argon2id cost and receive the same accepted response shape with a decoy proof, while only a newly committed account persists proof state or triggers delivery.
- Browser proof issuance requires both `platform: web` and an exact configured Origin. Native requests reject a browser Origin, preventing caller metadata from crossing credential transport boundaries.
- Mail dispatch begins after commit but is not awaited by the public response, preventing provider latency or failure from becoming an identity-enumeration signal.
- Generated files remain generator-owned; the generator asserts a stable `register` operation and required schemas before writing JSON or TypeScript.

## TDD Gate Compliance

- **RED:** `30ff2ba` followed successful discovery and failed with the exact `IMPLEMENTATION_MISSING_REGISTER_API` behavior marker on PostgreSQL 18.
- **GREEN:** `fb4a8ac` removed the marker, implemented the API/contract, and passed all 15 focused cases.
- **REFACTOR:** No separate refactor was required; the focused suite, full API suite, strict typechecks, deterministic generation, and drift gate pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added the missing executable OpenAPI generator and package shell**

- **Found during:** Task 2 (Implement registration and generated contract)
- **Issue:** `openapi:generate` referenced a nonexistent compiled entrypoint and `packages/api-client` did not yet exist, so the planned generated contract could not be produced or checked.
- **Fix:** Added a source generator, emission config, deterministic contract/client output, and strict generated package boundary without introducing a new dependency.
- **Files modified:** `apps/api/src/openapi/generate-openapi.ts`, `apps/api/tsconfig.build.json`, `apps/api/package.json`, `packages/api-client/**`
- **Verification:** Two consecutive generations were byte-identical; generated-client typecheck and drift check pass.
- **Committed in:** `fb4a8ac`

**2. [Rule 1 - Bug] Isolated registration tests from throttle and database state leakage**

- **Found during:** Task 2 GREEN verification
- **Issue:** The activated HTTP cases shared one rate-limit identity and persisted rows into later direct-database cases, producing 429 responses and false uniqueness/count failures unrelated to registration behavior.
- **Fix:** Reset the disposable database before each case and assign each injected request a deterministic isolated remote address while leaving production throttling enabled.
- **Files modified:** `apps/api/test/auth/register.int.test.ts`
- **Verification:** Focused registration suite passes 15/15 and the complete API suite passes 26 tests.
- **Committed in:** `fb4a8ac`

**3. [Rule 3 - Blocking] Replaced the unavailable PowerShell 7 drift entrypoint**

- **Found during:** Task 2 acceptance gate
- **Issue:** `pnpm openapi:check` invoked `pwsh`, which is unavailable in this Windows environment, so the canonical drift command could not execute.
- **Fix:** Replaced only the runner with a cross-platform Node script that preserves generation, tracked diff, and untracked output checks.
- **Files modified:** `apps/api/package.json`, `scripts/check-openapi-drift.mjs`
- **Verification:** `pnpm openapi:check` passes against the committed generated tree.
- **Committed in:** `4cc7227`

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking issues).
**Impact on plan:** All fixes were necessary to make the planned security and drift gates truthful and executable; no authentication scope or dependency identity changed.

## Issues Encountered

- Docker Hub returned EOF while resolving the locked PostgreSQL 18.4 image. Verification used the locally cached immutable PostgreSQL digest `sha256:9b5bd946f3a507db72c55959700e517463e8d5dbb6f7eb30d920d5bcf6951431` on isolated port 55442; it reported PostgreSQL 18.2. No committed Compose pin or application configuration changed.
- Context7 MCP and the `ctx7` CLI fallback were unavailable. Version-specific APIs were verified against installed Nest/Prisma/Argon2 declarations, the existing project boundary, strict TypeScript, and executable integration tests.

## User Setup Required

None - no production SMTP provider, public origin, or external credential is required for this plan.

## Known Stubs

None. The mechanical `null` match is the intentional unique-error type guard; no empty/mock data or placeholder behavior flows to a response.

## Next Phase Readiness

- Plan 01-15 can submit through the generated `register` client and write the native proof through `PendingProofStore`; Web remains cookie-only.
- Plan 01-17 can match the persisted proof hash during verification, clear the proof at the terminal boundary, and issue a session only for the same device.
- Resend and verification owners can rely on a committed EmailVerificationToken plus post-commit MailPort delivery without exposing plaintext token state.

## Self-Check: PASSED

- All seven key created source/contract files exist and all 18 task files are committed.
- RED commit `30ff2ba` precedes GREEN commit `fb4a8ac`; drift-gate fix `4cc7227` contains no tracked deletion.
- Registration tests pass 15/15, the complete API suite passes 26 tests with 55 downstream cases intentionally skipped, and both API and generated-client strict typechecks pass.
- `pnpm openapi:check` reports no tracked or untracked drift; stub and threat scans found no goal-blocking stub or unplanned security surface.

---
*Phase: 01-safe-account-entry*
*Completed: 2026-08-01*
