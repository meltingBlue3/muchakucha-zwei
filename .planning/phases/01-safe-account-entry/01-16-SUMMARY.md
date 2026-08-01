---
phase: 01-safe-account-entry
plan: 16
subsystem: auth
tags: [nestjs, fastify, prisma, email-verification, httponly-cookie, openapi]

requires:
  - phase: 01-safe-account-entry/01-13
    provides: Transaction-safe registration, hash-only verification state, pending proof transport, and generated client pipeline
provides:
  - Server-authoritative POST-only email verification with distinct D-07 terminal outcomes
  - Atomic same-device proof consumption, AuthSession creation, and first hashed RefreshToken issuance
  - Authoritative resend cooldown with atomic token supersession and post-commit delivery
  - Generated complete and resend operations with Web cookie-only secret handling
affects: [01-17, 01-18, verification-ui, session-api]

tech-stack:
  added: []
  patterns:
    - Verification conditionally consumes one-time state at serializable isolation before optional session creation
    - Resend transfers the pending proof hash to the successor token while invalidating the prior token atomically
    - Web completion derives proof and refresh transport from API-owned HttpOnly cookies; native uses validated body proof

key-files:
  created:
    - apps/api/src/modules/auth/dto/complete-email-verification.dto.ts
    - apps/api/src/modules/auth/dto/resend-email-verification.dto.ts
  modified:
    - apps/api/src/modules/auth/auth.controller.ts
    - apps/api/src/modules/auth/auth.service.ts
    - apps/api/test/auth/verify-email.int.test.ts
    - apps/api/src/openapi/generate-openapi.ts
    - packages/api-client/openapi.json
    - packages/api-client/src/generated/client.ts
    - packages/api-client/src/generated/models.ts
    - apps/api/src/main.ts

key-decisions:
  - "Transfer the existing pending-proof hash to a newly issued verification token inside the resend transaction so D-06 same-device continuation survives token supersession without exposing the proof."
  - "Derive Web completion mode from an exact allowed Origin plus the API-owned pending cookie; native refresh material is returned only when the accepted proof came from the validated native request body."
  - "Return resend eligibility through the stable error envelope as retryAfterSeconds while retaining independent Nest throttling as the outer abuse-control layer."

patterns-established:
  - "Verification transaction: conditional active-token claim, emailVerifiedAt update, and optional AuthSession/first RefreshToken insertion are one serializable unit."
  - "Cookie terminal handling: Web completion always clears pending proof with matching attributes and issues refresh only for a matched cookie proof."

requirements-completed: [AUTH-02, SAFE-03]

coverage:
  - id: D1
    description: "Email verification classifies valid same-device, cross-device, expired, used, invalid, and superseded links while GET cannot consume state."
    requirement: AUTH-02
    verification:
      - kind: integration
        ref: "apps/api/test/auth/verify-email.int.test.ts#email verification API contract (13 passed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A matching registration proof is consumed atomically with session and first refresh creation, while concurrent reuse creates exactly one session."
    requirement: SAFE-03
    verification:
      - kind: integration
        ref: "apps/api/test/auth/verify-email.int.test.ts#consumes a verification token and matching pending proof at most once"
        status: pass
    human_judgment: false
  - id: D3
    description: "Web uses HttpOnly pending and refresh cookies with terminal clearing and no JSON secret, while native receives refresh material for SecureStore."
    requirement: SAFE-03
    verification:
      - kind: integration
        ref: "apps/api/test/auth/verify-email.int.test.ts#Web and native continuation cases"
        status: pass
    human_judgment: false
  - id: D4
    description: "Resend returns authoritative 60-second eligibility, enforces cooldown, supersedes the active token, preserves continuation proof, and delivers after commit."
    requirement: AUTH-02
    verification:
      - kind: integration
        ref: "apps/api/test/auth/verify-email.int.test.ts#resend contract cases"
        status: pass
      - kind: other
        ref: "pnpm openapi:check"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-08-01
status: complete
---

# Phase 01 Plan 16: Transactional Email Verification and Resend Summary

**Server-authoritative email verification now atomically consumes registration proof, creates same-device sessions, guides cross-device login, rotates resend links, and preserves Web/native secret boundaries.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-01T14:14:00+08:00
- **Completed:** 2026-08-01T14:24:00+08:00
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Activated and passed thirteen migrated PostgreSQL/HTTP cases for all D-06 through D-08 verification, proof, cookie, concurrency, and resend outcomes.
- Implemented a serializable conditional-consume transaction that verifies the user and, only on matching proof, creates one AuthSession plus its first hash-only RefreshToken atomically.
- Added API-owned Web pending/refresh cookie issuance and clearing while native receives refresh material for SecureStore and cross-device requests receive login guidance only.
- Added authoritative resend eligibility, atomic predecessor invalidation with proof transfer, post-commit mail delivery, and deterministic generated complete/resend clients.

## Task Commits

Each task was committed atomically:

1. **Task 1: Activate verification/resend RED matrix** - `655a711` (test)
2. **Task 2: Implement transactional verification and resend** - `aa92fae` (feat)

## Files Created/Modified

- `apps/api/src/modules/auth/auth.controller.ts` - Complete/resend routes, transport validation, and matched cookie issuance/clearing.
- `apps/api/src/modules/auth/auth.service.ts` - D-07 classification, serializable consumption/session creation, and transactional resend.
- `apps/api/src/modules/auth/dto/complete-email-verification.dto.ts` - Strict completion request and outcome contract.
- `apps/api/src/modules/auth/dto/resend-email-verification.dto.ts` - Strict resend and retry eligibility contract.
- `apps/api/test/auth/verify-email.int.test.ts` - Thirteen real registration, database, HTTP, proof, cookie, and resend cases.
- `apps/api/src/openapi/generate-openapi.ts` - Deterministic generated verification/resend operations.
- `packages/api-client/openapi.json` / `packages/api-client/src/generated/*` - Published verification models and client methods.
- `apps/api/src/main.ts` - Stable error envelope support for authoritative retry seconds.

## Decisions Made

- Preserved same-device continuation across resend by moving the stored proof hash from the invalidated token to its successor inside one transaction.
- Selected Web/native secret behavior from the credential source, never from a caller-controlled response-mode header.
- Kept access credential signing and refresh rotation under Plan 01-18 ownership; this plan creates the durable session and first hash-only refresh generation required by D-06.

## TDD Gate Compliance

- **RED:** `655a711` followed successful discovery and failed with the exact `IMPLEMENTATION_MISSING_VERIFY_API` marker against PostgreSQL 18.
- **GREEN:** `aa92fae` removed the marker and passed all thirteen focused cases, the 39-test API regression, strict typechecks, deterministic generation, and the OpenAPI drift gate.
- **REFACTOR:** No separate refactor commit was required.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used the approved cached PostgreSQL 18 fallback after Docker Hub EOF**

- **Found during:** Task 1 RED verification
- **Issue:** Docker Hub returned EOF while resolving the committed PostgreSQL 18.4 image, preventing test discovery.
- **Fix:** Reused the existing isolated cached PostgreSQL 18 container on port 55442 for RED/GREEN verification without changing the committed Compose pin.
- **Files modified:** None
- **Verification:** Integration setup accepted server major 18; focused and full API suites passed.
- **Committed in:** No file change

**2. [Rule 1 - Bug] Corrected terminal-state fixtures to satisfy database constraints**

- **Found during:** Task 2 GREEN verification
- **Issue:** The expired fixture initially moved expiry before creation, and the resend mail spy retained the registration call, producing false test failures.
- **Fix:** Aged creation and expiry together and cleared the prior spy call before asserting post-commit resend delivery.
- **Files modified:** `apps/api/test/auth/verify-email.int.test.ts`
- **Verification:** Focused suite passes 13/13.
- **Committed in:** `aa92fae`

**3. [Rule 2 - Missing Critical] Exposed authoritative cooldown in the stable API error envelope**

- **Found during:** Task 2 implementation
- **Issue:** The global exception filter discarded `retryAfterSeconds`, which would prevent the client from honoring server eligibility after a 429.
- **Fix:** Preserved the numeric field inside the stable error object without exposing any credential.
- **Files modified:** `apps/api/src/main.ts`
- **Verification:** The resend cooldown integration case receives a 59-60 second authoritative value.
- **Committed in:** `aa92fae`

---

**Total deviations:** 3 auto-fixed (1 bug, 1 missing critical functionality, 1 blocking environment issue).
**Impact on plan:** All changes were required for truthful verification or the locked D-08/server-authoritative contract; no dependency, schema, or authentication architecture changed.

## Issues Encountered

- PowerShell 7 (`pwsh`) is unavailable in the environment, so the identical checked-in RED script was invoked through Windows PowerShell 5.1.
- Docker Hub returned EOF for the locked PostgreSQL image; the existing isolated cached PostgreSQL 18 container provided the approved non-committed fallback.

## User Setup Required

None - no production SMTP provider, origin, or external credential is required.

## Known Stubs

None. Signed access JWT and refresh rotation remain explicit Plan 01-18 ownership rather than placeholders in this verification boundary.

## Next Phase Readiness

- Plan 01-17 can consume generated complete/resend operations, accept native/Web issued session material, clear native proof, and render every D-07/D-08 state.
- Plan 01-18 can add signed access JWTs and refresh rotation on top of the AuthSession/RefreshToken graph created by same-device verification.
- No unresolved blocker remains.

## Self-Check: PASSED

- Both DTO files exist; all ten plan-touched files and commits `655a711`/`aa92fae` are present with no tracked deletion or untracked output.
- RED precedes GREEN; focused verification passes 13/13 and the complete API suite passes 39 tests with only downstream Wave 0 suites skipped.
- API and generated-client strict typechecks pass, two consecutive generations are byte-identical, and `pnpm openapi:check` reports no drift.
- Stub and threat scans found no goal-blocking stub or security surface beyond the planned verification/resend endpoints and D-06 mitigations.

---
*Phase: 01-safe-account-entry*
*Completed: 2026-08-01*
