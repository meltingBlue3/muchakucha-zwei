---
phase: 01-safe-account-entry
plan: 18
subsystem: auth
tags: [nestjs, jwt, prisma, refresh-rotation, httponly-cookie, openapi]

requires:
  - phase: 01-safe-account-entry/01-16
    provides: Verified same-device AuthSession creation, first hash-only refresh generation, and platform-split issued-session transport
provides:
  - Verified email/password login with independent device sessions and 15-minute HS256 access JWTs
  - Serializable refresh rotation with retained hash-only generations and targeted replay compromise
  - API-owned Web HttpOnly refresh cookies and native-only JSON refresh credentials
  - Session-aware access guard plus generated login and refresh client operations
affects: [01-19, 01-20, session-bootstrap, logout, users-me]

tech-stack:
  added: []
  patterns:
    - Access JWTs contain only sub and sid domain claims while guards re-check durable session state
    - Refresh response shape is selected from the accepted cookie or body credential source
    - Replay compromise is returned from, rather than thrown inside, the serializable transaction so revocation commits

key-files:
  created:
    - apps/api/src/modules/auth/access-token.guard.ts
    - apps/api/src/modules/auth/dto/login.dto.ts
    - apps/api/src/modules/auth/dto/refresh.dto.ts
  modified:
    - apps/api/src/modules/auth/auth.controller.ts
    - apps/api/src/modules/auth/auth.module.ts
    - apps/api/src/modules/auth/auth.service.ts
    - apps/api/test/auth/login.int.test.ts
    - apps/api/test/auth/refresh-rotation.int.test.ts
    - apps/api/src/openapi/generate-openapi.ts
    - packages/api-client/openapi.json
    - packages/api-client/src/generated/client.ts
    - packages/api-client/src/generated/models.ts
    - apps/api/package.json
    - pnpm-lock.yaml

key-decisions:
  - "Use the approved @nestjs/jwt HS256 implementation with a mandatory 32-byte production secret, a 15-minute lifetime, and only sub/sid domain claims."
  - "Return replay as a transaction outcome and throw only after commit so the affected AuthSession remains durably revoked and compromised."
  - "Require an exact allowed Origin for cookie refresh, forbid Origin on body refresh, and reject ambiguous credential sources before rotation."

patterns-established:
  - "Rotation transaction: look up the retained hash, classify terminal state, conditionally consume once, insert the linked successor, and update last-seen at Serializable isolation with bounded conflict retry."
  - "Access authorization: verify an allowlisted HS256 signature and expiry, then bind sub/sid to an active non-expired database session."

requirements-completed: [AUTH-03, SAFE-03, SAFE-04]

coverage:
  - id: D1
    description: "Verified login creates independent hash-only device sessions and signed 15-minute access tokens while invalid and unverified attempts create none."
    requirement: AUTH-03
    verification:
      - kind: integration
        ref: "apps/api/test/auth/login.int.test.ts#login API contract (10 passed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Refresh generations rotate atomically, retain only SHA-256 hashes, detect replay and concurrency, and compromise only the affected device family."
    requirement: SAFE-04
    verification:
      - kind: integration
        ref: "apps/api/test/auth/refresh-rotation.int.test.ts#refresh rotation API contract (11 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Web refresh remains in a narrowly scoped HttpOnly cookie while native receives JSON refresh material, with exact Origin/CORS and ambiguous-source rejection."
    requirement: SAFE-03
    verification:
      - kind: integration
        ref: "apps/api/test/auth/login.int.test.ts and refresh-rotation.int.test.ts#platform transport cases"
        status: pass
    human_judgment: false
  - id: D4
    description: "Generated client exposes deterministic typed login and refresh operations without Prisma coupling or OpenAPI drift."
    requirement: AUTH-03
    verification:
      - kind: other
        ref: "pnpm openapi:check"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-08-01
status: complete
---

# Phase 01 Plan 18: Verified Login and Rotating Sessions Summary

**Verified login now issues minimal signed access JWTs and independent hash-only device sessions, while serializable refresh rotation detects replay without leaking Web credentials to JavaScript.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-01T06:53:54Z
- **Completed:** 2026-08-01T07:05:07Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- Activated a 21-case PostgreSQL/HTTP security matrix covering verified and unverified login, generic failures, JWT signature/algorithm/key/expiry, access guard revocation, rotation, expiry, replay, concurrency, device isolation, cookie topology, CORS, and credential-source ambiguity.
- Added verified Argon2id login with one durable session per device, 15-minute HS256 access tokens containing only `sub` and `sid`, and a guard that validates both the token and current database session state.
- Implemented serializable conditional refresh consumption, linked hash-only successor generations, bounded serialization retry, committed replay compromise, absolute expiry, and independent family revocation.
- Published deterministic generated login/refresh DTOs and client methods while keeping production Web refresh in `__Secure-mk_refresh` and native refresh in JSON for SecureStore.

## Task Commits

Each task was committed atomically:

1. **Task 1: Activate login and rotation RED matrices** - `7bf16f6` (test)
2. **Task 2: Implement verified login and atomic rotation** - `1d6584d` (feat)

## Files Created/Modified

- `apps/api/src/modules/auth/access-token.guard.ts` - Allowlisted JWT verification plus durable session binding.
- `apps/api/src/modules/auth/dto/login.dto.ts` / `refresh.dto.ts` - Strict OpenAPI-decorated request and response contracts.
- `apps/api/src/modules/auth/auth.controller.ts` - Login/refresh endpoints, exact transport validation, and cookie-only Web responses.
- `apps/api/src/modules/auth/auth.service.ts` - Argon2id login, signed access issuance, serializable rotation, and replay compromise.
- `apps/api/test/auth/login.int.test.ts` - Ten migrated login/JWT/guard/cookie/CORS cases.
- `apps/api/test/auth/refresh-rotation.int.test.ts` - Eleven migrated rotation/hash/replay/concurrency/device cases.
- `apps/api/src/openapi/generate-openapi.ts` and `packages/api-client/**` - Deterministic generated login/refresh client boundary.
- `apps/api/package.json` / `pnpm-lock.yaml` - Direct API declaration of the already approved exact `@nestjs/jwt@11.0.2` dependency.

## Decisions Made

- Kept access signing symmetric for the current modular monolith, but fail closed in production unless a minimum 32-byte secret is supplied; verification accepts only HS256.
- Preserved consumed refresh rows and their parent linkage so a known hash can identify and compromise exactly one durable device session.
- Selected refresh transport from the credential actually accepted by the API, not from caller-declared platform metadata.

## TDD Gate Compliance

- **RED:** `7bf16f6` followed successful PostgreSQL 18 discovery and each focused suite failed only with `IMPLEMENTATION_MISSING_SESSION_API`.
- **GREEN:** `1d6584d` removed the marker and passes 21 focused cases, 60 API regression cases, 54 quick API/client tests, strict API/generated-client typechecks, deterministic generation, and the post-commit OpenAPI drift gate.
- **REFACTOR:** No separate refactor commit was required.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used the approved cached PostgreSQL 18 fallback**

- **Found during:** Task 1 RED verification
- **Issue:** The phase's locked Docker registry image path had already encountered registry EOF, while truthful RED/GREEN required migrated PostgreSQL 18.
- **Fix:** Reused the isolated cached PostgreSQL 18 instance on port 55442 without changing the committed PostgreSQL 18 pin.
- **Files modified:** None
- **Verification:** Integration global setup accepted database major 18; focused and full API suites passed.
- **Committed in:** No file change

**2. [Rule 3 - Blocking] Declared the approved JWT package at the API workspace boundary**

- **Found during:** Task 2 implementation
- **Issue:** `@nestjs/jwt@11.0.2` was approved and installed at the root, but the API importer did not declare it directly under pnpm's strict workspace boundary.
- **Fix:** Added the exact approved pin to `apps/api/package.json` and refreshed only lockfile metadata offline with zero downloads.
- **Files modified:** `apps/api/package.json`, `pnpm-lock.yaml`
- **Verification:** Frozen dependency resolution, API typecheck, focused tests, and full API regression pass.
- **Committed in:** `1d6584d`

**3. [Rule 1 - Bug] Corrected security fixtures to match real cookie serialization and evidence mapping**

- **Found during:** Task 2 GREEN verification
- **Issue:** The initial production-cookie assertion assumed an attribute order Fastify does not guarantee, and renamed test titles broke the exact ASVS evidence audit.
- **Fix:** Asserted every cookie attribute independently and restored the canonical ASVS assertion names while retaining stronger checks.
- **Files modified:** `apps/api/test/auth/login.int.test.ts`, `apps/api/test/auth/refresh-rotation.int.test.ts`
- **Verification:** Focused suites pass 21/21 and the ASVS audit passes inside the 60-test API regression.
- **Committed in:** `1d6584d`

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking issues).
**Impact on plan:** Every deviation was required for truthful, dependency-correct security verification; no schema, package choice, or credential architecture changed.

## Issues Encountered

- PowerShell 7 is unavailable, so the checked-in RED helper ran identically under Windows PowerShell 5.1.
- The committed PostgreSQL image/version remained unchanged; only the approved isolated cached PostgreSQL 18 runtime was used for tests.

## User Setup Required

None for local development. Production must supply `JWT_ACCESS_SECRET` with at least 32 bytes alongside the already required production origin, SMTP, and link-origin configuration.

## Known Stubs

None. Static scans found no session marker, skipped focused suite, placeholder, persistent Web secret store, or goal-blocking empty data path.

## Next Phase Readiness

- Session bootstrap can restore through the generated refresh operation and distinguish explicit credential rejection from availability failures.
- Logout and `/users/me` can reuse the exported access guard and exact durable `sid` binding.
- No unresolved blocker remains.

## Self-Check: PASSED

- All three created files and eleven modified files exist, and task commits `7bf16f6` and `1d6584d` are present in order with no tracked deletion or untracked output.
- Focused login/rotation verification passes 21/21; complete API regression passes 60 tests; quick API/client regression passes 54 tests.
- API and generated-client strict typechecks pass; consecutive generation is byte-identical; `pnpm openapi:check` reports no drift.
- Hash/storage, marker/stub, Web storage, and threat-surface scans found no plaintext persisted refresh credential, goal-blocking stub, or unplanned security surface.

---
*Phase: 01-safe-account-entry*
*Completed: 2026-08-01*
