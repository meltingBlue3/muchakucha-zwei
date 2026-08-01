---
phase: 01-safe-account-entry
plan: 26
subsystem: testing
tags: [playwright, axe, accessibility, asvs, postgres, security]

requires:
  - phase: 01-23
    provides: accessible password-reset client flow and browser coverage
  - phase: 01-25
    provides: protected profile and current-device logout browser flows
provides:
  - complete automated Web accessibility matrix across auth, result, and profile states
  - final executable OWASP ASVS 5.0.0 L1 evidence map
  - deterministic local E2E mailbox and isolated test-only rate-limit bypass
affects: [01-27, phase-01-verification, security-audit, ui-review]

tech-stack:
  added: []
  patterns: [single-process E2E mailbox, explicit test-only infrastructure switches, fail-fast acceptance gates]

key-files:
  created: [e2e/support/mailbox-server.mjs]
  modified: [e2e/auth/accessibility.spec.ts, playwright.config.ts, apps/api/src/app.module.ts, docs/security/asvs-v5.0.0-l1.md]

key-decisions:
  - "Use one deterministic SMTP/HTTP mailbox process for the complete Playwright run when the pinned Mailpit image is unavailable."
  - "Bypass throttling only when NODE_ENV=test and Playwright explicitly sets E2E_DISABLE_RATE_LIMITS=true; production and integration security tests retain real limits."
  - "Use a disposable tmpfs-backed PostgreSQL 18 fallback for verification without changing the committed Compose image pin."

patterns-established:
  - "E2E infrastructure is started once by Playwright and queried through stable local HTTP test endpoints."
  - "Security-control bypasses require both an exact test environment and an explicit opt-in flag."

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, SAFE-03, SAFE-04]

coverage:
  - id: D1
    description: "The complete Web authentication accessibility matrix passes axe, responsive, focus, live-region, zoom, reduced-motion, and forced-colors checks."
    requirement: SAFE-04
    verification:
      - kind: automated_ui
        ref: "e2e/auth/accessibility.spec.ts — pnpm exec playwright test e2e/auth/accessibility.spec.ts"
        status: pass
      - kind: unit
        ref: "apps/client/src/ui/__tests__ — token-static, contrast, primitive-states"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every applicable Phase 1 OWASP ASVS 5.0.0 L1 control has a stable ID, official text, existing path, and exact green assertion."
    requirement: SAFE-03
    verification:
      - kind: integration
        ref: "apps/api/test/security/asvs-v5-l1.test.ts — pnpm --filter api test --run test/security/asvs-v5-l1.test.ts"
        status: pass
      - kind: other
        ref: "scripts/check-required-tests.ps1 — all 23 required contracts present without forbidden markers"
        status: pass
    human_judgment: false

duration: 11min
completed: 2026-08-02
status: complete
---

# Phase 01 Plan 26: Automated UI and ASVS Quality Gates Summary

**A 24-journey Playwright gate now closes the full Web accessibility matrix while an offline 32-control ASVS audit ties every applicable L1 row to an exact passing assertion.**

## Performance

- **Duration:** 11 min (continuation execution)
- **Started:** 2026-08-01T17:41:51Z
- **Completed:** 2026-08-01T17:51:51Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments

- Activated and passed ten dedicated accessibility journeys covering axe at 320/390/768/1440, all delivered auth/result/profile states, keyboard order, invalid/status focus, live regions, 200% zoom, reduced motion, and forced colors.
- Passed the complete fail-fast acceptance chain: required-test audit, PostgreSQL 18 migration status, workspace unit tests, 82 integration tests, 24 browser journeys, OpenAPI drift, and the focused four-test ASVS audit.
- Finalized the ASVS evidence map with exact green commands and clearly separated stricter project controls from L1 claims.
- Replaced competing per-spec SMTP listeners with one deterministic Playwright-owned mailbox and retained production rate limits outside an explicit test-only execution mode.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Activate Web accessibility matrix** - `7bc6436` (test)
2. **Task 1 GREEN: Close Web accessibility matrix** - `2ec976f` (feat)
3. **Task 2: Finalize ASVS evidence and full automated gate** - `a3e9f35` (test)

## Files Created/Modified

- `e2e/auth/accessibility.spec.ts` - Complete responsive and preference-aware Web accessibility matrix.
- `apps/client/src/ui/theme.ts` and `apps/client/src/ui/primitives.tsx` - Accessible theme and primitive behavior required by the matrix.
- `e2e/support/mailbox-server.mjs` - Single-process local SMTP capture with a narrow readiness/message API for E2E only.
- `playwright.config.ts` - Serial E2E orchestration, mailbox lifecycle, and explicit test-only rate-limit switch.
- `e2e/auth/password-reset.spec.ts` and `e2e/auth/verify-email.spec.ts` - Shared mailbox retrieval for delivered links.
- `apps/api/src/app.module.ts` - Exact `NODE_ENV=test` plus explicit flag guard around E2E throttling bypass.
- `docs/security/asvs-v5.0.0-l1.md` - Final green evidence status and stricter-project-control labeling.

## Decisions Made

- Kept the committed PostgreSQL 18.4 and Mailpit 1.30.0 Compose pins unchanged; verification used cached PostgreSQL 18.2 in a disposable tmpfs container and the repository-owned mailbox fallback.
- Made the local E2E mailbox the single SMTP owner so password reset, verification, and account-action suites cannot race for the same port.
- Preserved real throttling everywhere except an API process that is simultaneously in `NODE_ENV=test` and explicitly launched with `E2E_DISABLE_RATE_LIMITS=true` by Playwright.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Replaced unavailable pinned service images during local verification**
- **Found during:** Task 2 full automated gate
- **Issue:** Docker Hub returned EOF while resolving the pinned PostgreSQL 18.4 image, and the pinned Mailpit image was not locally available.
- **Fix:** Used a cached PostgreSQL 18.2 image in a disposable tmpfs-backed container and a repository-owned local SMTP/HTTP mailbox without changing committed image pins or persisting credentials.
- **Files modified:** `e2e/support/mailbox-server.mjs`, `playwright.config.ts`, `e2e/auth/password-reset.spec.ts`, `e2e/auth/verify-email.spec.ts`
- **Verification:** PostgreSQL reported major 18; all 24 Playwright tests passed.
- **Committed in:** `a3e9f35`

**2. [Rule 3 - Blocking] Isolated E2E journeys from localhost-wide production throttling**
- **Found during:** Task 2 full automated gate
- **Issue:** Multiple required registration journeys share one localhost IP and exceeded the production five-per-hour registration limit, causing later verification journeys to fail with 429 responses.
- **Fix:** Added a fail-closed bypass requiring both `NODE_ENV=test` and the exact Playwright-only flag; integration tests and every production/development process keep the real throttler.
- **Files modified:** `apps/api/src/app.module.ts`, `playwright.config.ts`
- **Verification:** The 82-test integration suite retained green throttling assertions and the 24-test E2E suite passed in one run.
- **Committed in:** `a3e9f35`

---

**Total deviations:** 2 auto-fixed (2 blocking issues).
**Impact on plan:** Both fixes were necessary to execute the planned acceptance gate deterministically and did not change production security behavior or committed infrastructure pins.

## Issues Encountered

- PowerShell 7 (`pwsh`) was unavailable on the host, so the required-test audit ran successfully in the current Windows PowerShell host before any suite execution.
- Docker Hub image resolution was unavailable; the authorized disposable PostgreSQL 18 fallback preserved the required database major.

## Known Stubs

None.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: local-test-endpoint | `e2e/support/mailbox-server.mjs` | Loopback-only E2E mailbox exposes captured test messages through a narrow unauthenticated local endpoint while the Playwright process runs. |
| threat_flag: test-security-bypass | `apps/api/src/app.module.ts` | Rate limiting can be skipped only under the conjunction of `NODE_ENV=test` and the explicit E2E flag; release configuration must never set that flag. |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 01-27 can proceed to Android human acceptance with all automated functional, visual-contract, accessibility, OpenAPI, and ASVS gates green.
- Native device behavior remains the only intentional human-verification boundary.

## Self-Check: PASSED

- Verified all key files exist on disk.
- Verified commits `7bc6436`, `2ec976f`, and `a3e9f35` exist in Git history.
- Re-ran every task acceptance criterion and the complete plan-level fail-fast gate successfully.

---
*Phase: 01-safe-account-entry*
*Completed: 2026-08-02*
