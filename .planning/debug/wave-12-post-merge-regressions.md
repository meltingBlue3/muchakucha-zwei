---
status: awaiting_human_verify
trigger: "Diagnose and fix Wave 12 post-merge regressions on sequential main: client SessionTransport cross-suite failures and intermittent API email-verification concurrent completion failure."
created: 2026-08-01T22:28:57.7641219+08:00
updated: 2026-08-01T22:50:00+08:00
---

## Current Focus

reasoning_checkpoint:
  hypothesis: "The client failures are initiated because apiResponse lacks text() required by generated authenticated requests, then amplified because mockClear preserves unconsumed one-shot fetch responses; the API 500 occurs because simultaneous Serializable token claims conflict and completeEmailVerification uniquely lacks the established P2034 retry."
  confirming_evidence:
    - "The first generated-client test fails even in isolation immediately after refresh succeeds and getMe calls response.text() on a helper that only defines json()."
    - "The client failure sequence shifts queued responses: retry responses remain after the early text() exception and the later replay response is consumed by the network-failure case."
    - "On PostgreSQL 18.2, the concurrent verification test deterministically returns one 200 verified_auto_login and one 500 INTERNAL_ERROR; adjacent Serializable auth methods already retry Prisma P2034, while this method does not."
  falsification_test: "If adding text() plus resetting fetch implementations does not make all 18 focused client tests pass, or if retrying only serialization conflicts does not make repeated concurrent completion yield exactly used plus verified_auto_login, the hypothesis is wrong."
  fix_rationale: "Make response doubles honor the generated Fetch Response contract, restore the rejecting fetch default before every test, and apply the repository's existing bounded Serializable-conflict retry pattern to verification completion."
  blind_spots: "The HTTP error body hides Prisma's internal code, so P2034 is inferred from the exact concurrent Serializable write mechanism and established neighboring retry pattern; full regression and repeated focused runs must validate it."
next_action: parent orchestrator confirms the merged sequential-main workflow remains green

## Symptoms

expected: focused and full client suites both pass with SessionTransport returning offline/retainedCredential or the expected reauthentication reasons; concurrent email verification completion is deterministic
actual: full pnpm test reports six SessionTransport failures after login/bootstrap UI suites, returning reauthRequired/replayed instead; full API regression intermittently reports 84/85 with concurrent verification completion failing
errors: "SessionTransport expectation mismatches: expected offline/retainedCredential or specific reauth reasons, received reauthRequired/replayed; intermittent concurrent email verification completion failure"
reproduction: run focused SessionTransport suite (previously 18/18), then run full pnpm test or an ordered client run including login/bootstrap suites before SessionTransport; repeatedly run API email verification concurrency test/full API suite
started: after Wave 12 merge on sequential main

## Eliminated

## Evidence

- timestamp: 2026-08-01T22:32:30+08:00
  checked: client Jest setup and session transport modules
  found: setup resets SecureStore data and only calls mockClear on the shared fetch mock; native/web refresh coordinators are module singletons by design for cross-instance single-flight
  implication: mock implementations or queued one-shot results can leak between tests even though call counts and stored credentials are reset

- timestamp: 2026-08-01T22:32:30+08:00
  checked: completeEmailVerification transaction and concurrent integration test
  found: the claim transaction runs at Serializable isolation without the serialization-conflict retry used by other auth flows; concurrent test sends two claims for the same token
  implication: PostgreSQL can abort one concurrent transaction with Prisma P2034 instead of allowing it to reach lost_claim classification

- timestamp: 2026-08-01T22:34:15+08:00
  checked: focused SessionTransport suite, 18 tests
  found: 12 adapter-only tests pass and all 6 failures begin with generated ApiClient usage; outcomes show the replay response queued in one test is consumed by the following network case
  implication: the generated-client requests are not consuming the fetch one-shot queue when expected, and unconsumed queue entries leak forward inside the test file

- timestamp: 2026-08-01T22:37:00+08:00
  checked: isolated first generated-client test and generated ApiClient implementation
  found: the test still fails alone; refresh consumes json(), but the following authenticated users/me request calls response.text() while apiResponse exposes only json()
  implication: the missing text response method is the initial deterministic failure; later tests become misleading because mockClear preserves any unconsumed mockImplementationOnce queue

- timestamp: 2026-08-01T22:41:00+08:00
  checked: concurrent verification on disposable PostgreSQL 18.2
  found: two simultaneous identical completions produce one 200 verified_auto_login and one 500 INTERNAL_ERROR on demand
  implication: the losing Serializable transaction escapes as an internal failure instead of being retried to observe consumed state and return used

- timestamp: 2026-08-01T22:47:00+08:00
  checked: focused post-fix verification
  found: SessionTransport passes 18/18; concurrent email verification passes 5 consecutive isolated executions; client and API TypeScript checks pass
  implication: both causal fixes satisfy their falsification tests and are ready for full regression

- timestamp: 2026-08-01T22:50:00+08:00
  checked: full pnpm test against disposable PostgreSQL 18.2
  found: API passes 85/85; client passes 67 tests with 13 expected skips across 7 passed and 2 skipped suites
  implication: the fixes resolve both reported regressions without breaking adjacent workspace behavior

## Resolution

root_cause: "Client response mocks violated the generated client's text() contract and fetch mock implementations were not reset between tests; email verification used a Serializable claim transaction without the bounded P2034 retry already used by refresh/password-reset concurrency paths."
fix: "Added Fetch Response text() support to session test doubles, reset the global fetch mock implementation before every test, and added a bounded three-attempt P2034 retry around email verification's Serializable transaction."
verification: "Focused SessionTransport 18/18; concurrent email verification 5/5 repeated runs; client and API typechecks passed; full pnpm test passed with API 85/85 and client 67 passed plus 13 expected skips."
files_changed: [apps/client/jest.setup.ts, apps/client/src/platform/session/__tests__/session-transport-test.ts, apps/api/src/modules/auth/auth.service.ts]
