---
status: awaiting_human_verify
trigger: "Wave 9 post-merge regression: full pnpm test has one failure in apps/api/test/auth/login.int.test.ts; jwt.verify reports JsonWebTokenError: invalid signature while focused security matrix passes 21/21. Diagnose, fix, verify, and commit."
created: 2026-08-01T21:05:48.6360218+08:00
updated: 2026-08-01T21:19:10+08:00
---

## Current Focus

reasoning_checkpoint:
  hypothesis: "`createApplication(environment)` creates a split configuration model: HTTP runtime config uses the explicit argument, but `AuthModule` signs JWTs using global `process.env`; therefore an absent/different ambient secret produces a token that cannot be verified with the explicit application secret."
  confirming_evidence:
    - "With ambient `JWT_ACCESS_SECRET` absent, the isolated login file reproducibly fails exactly at signature verification (1 failed, 9 passed)."
    - "Changing only ambient `JWT_ACCESS_SECRET` to equal the explicit test secret makes the identical file pass 10/10."
    - "Static trace shows `createApplication` never exposes its environment to `AuthModule`; `accessTokenSecret()` reads global `process.env`."
  falsification_test: "If `AuthModule` is initialized from the explicit `createApplication` environment while the ambient secret remains absent or different, the original test should still fail; that observation would disprove this hypothesis."
  fix_rationale: "Pass the explicit environment through dynamic `AppModule`/`AuthModule` registration so JWT signing and HTTP runtime validation share one configuration source, without mutating process-global state."
  blind_spots: "Other auth components still read global environment for cookie/mail behavior; they are outside this JWT signature regression and existing tests cover their current behavior."
next_action: hand the verified commit to the Wave 9 orchestrator for final integration confirmation

## Symptoms

expected: full `pnpm test` passes; login access token verifies with the configured test key and contains only the expected verified claims
actual: full `pnpm test` yields exactly one API failure at `jwt.verify` in the login integration test; focused Plan 01-18 security matrix passes 21/21
errors: `JsonWebTokenError: invalid signature`
reproduction: run full `pnpm test`; observe failure in `apps/api/test/auth/login.int.test.ts` test `issues a short-lived access JWT with only verified sub, sid, signature, algorithm, key, and expiry claims`
started: Wave 9 post-merge regression

## Eliminated

## Evidence

- timestamp: 2026-08-01T21:09:20+08:00
  checked: `apps/api/test/auth/login.int.test.ts`
  found: the app receives `JWT_ACCESS_SECRET: accessSecret` only inside the object passed to `createApplication`; token verification explicitly uses that same local constant
  implication: the test assumes dependency configuration derives from the `createApplication` argument

- timestamp: 2026-08-01T21:09:20+08:00
  checked: `apps/api/src/main.ts` and `apps/api/src/modules/auth/auth.module.ts`
  found: `createApplication(environment)` uses its argument only for runtime HTTP config; `JwtModule.registerAsync` calls `accessTokenSecret()`, which reads global `process.env` directly
  implication: HTTP runtime config and Nest provider config have divergent environment sources, making signatures dependent on ambient process state rather than the explicit application environment

- timestamp: 2026-08-01T21:09:20+08:00
  checked: `apps/api/vitest.config.ts` and environment writes under `apps/api`
  found: integration files are sequential (`fileParallelism: false`), while setup mutates global `DATABASE_URL` and login tests mutate `NODE_ENV`/`WEB_ORIGIN`; no setup pins or restores `JWT_ACCESS_SECRET`
  implication: initialization-order/environment leakage is feasible, but the explicit-vs-global secret mismatch can be tested deterministically without assuming test order

- timestamp: 2026-08-01T21:12:10+08:00
  checked: isolated login integration run with ambient `JWT_ACCESS_SECRET` removed
  found: PostgreSQL 18 disposable database on cached local container port 55442; test result was exactly 1 failed and 9 passed, with `JsonWebTokenError: invalid signature` at the reported assertion
  implication: the regression is deterministic and does not require cross-file suite leakage

- timestamp: 2026-08-01T21:12:10+08:00
  checked: counterfactual isolated login run with only ambient `JWT_ACCESS_SECRET` changed to the test constant
  found: the identical test file passed 10/10
  implication: ambient-vs-explicit secret divergence is causal, not merely correlated with test order

- timestamp: 2026-08-01T21:16:20+08:00
  checked: API typecheck after dynamic environment registration
  found: TypeScript strict typecheck passed
  implication: the dynamic module wiring is type-correct

- timestamp: 2026-08-01T21:16:20+08:00
  checked: original isolated login reproduction after fix with ambient `JWT_ACCESS_SECRET` absent
  found: all 10 login integration tests passed, including signature, algorithm, claim, guard, cookie, CORS, and throttling checks
  implication: the fix addresses the exact original symptom without depending on ambient secret state

- timestamp: 2026-08-01T21:19:10+08:00
  checked: focused ASVS security evidence file and full root `pnpm test` with ambient `JWT_ACCESS_SECRET` absent
  found: focused command exited successfully; full suite passed with API 60 passed / 24 skipped across 10 files and Client 51 passed / 22 skipped across 9 suites
  implication: JWT correction preserves adjacent API security/auth behavior and all current client regressions

- timestamp: 2026-08-01T21:19:10+08:00
  checked: `git diff --check`
  found: no whitespace errors
  implication: the patch is clean for commit

## Resolution

root_cause: `createApplication(environment)` did not pass its explicit environment into Nest auth provider construction; `AuthModule` read ambient `process.env` and signed with a fallback or leaked secret, while the test verified against the explicit application secret
fix:
fix: pass the explicit application environment through `AppModule.register(environment)` into `AuthModule.register(environment)`, and resolve the JWT signing secret from that environment rather than ambient global state
verification: original isolated login file passes 10/10 with ambient JWT secret absent; API strict typecheck passes; focused ASVS evidence passes; full root suite passes API 60/24 skipped and Client 51/22 skipped
files_changed: [apps/api/src/main.ts, apps/api/src/app.module.ts, apps/api/src/modules/auth/auth.module.ts]
