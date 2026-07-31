---
phase: 1
slug: safe-account-entry
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-01
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **API/shared framework** | Vitest + `@nestjs/testing` + Supertest |
| **Expo component framework** | Jest + `jest-expo` + React Native Testing Library |
| **Web E2E/a11y** | Playwright + `@axe-core/playwright` |
| **Database/email integration** | Docker Compose PostgreSQL 18 + Mailpit; dedicated migrated test database |
| **Config files** | None — Wave 0 creates root/API/client/Playwright configs |
| **Quick run command** | `pnpm test:quick` |
| **Full suite command** | `pnpm test && pnpm test:integration && pnpm test:e2e:web` |
| **Estimated runtime** | Quick ≤30 seconds warm; full suite target ≤5 minutes in CI |

## Sampling Rate

- **After every task commit:** Run `pnpm test:quick` plus the task-specific command from its plan.
- **After every plan wave:** Run `pnpm test && pnpm test:integration`.
- **Before `$gsd-verify-work`:** Run `pnpm test && pnpm test:integration && pnpm test:e2e:web`; Android smoke must pass.
- **iOS release backstop:** EAS build plus real-device deep-link/SecureStore smoke is required before claiming cross-platform release readiness, but does not block the Phase 1 development loop on Windows.
- **Max feedback latency:** 30 seconds for the quick loop; 5 minutes for a wave gate.

## Requirement Verification Map

| Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|-----------------|-----------|-------------------|-------------|--------|
| AUTH-01 | Registration is canonical-email race safe; password is Argon2id hashed; nickname is accepted | API integration + client component | `pnpm --filter api test --run test/auth/register.int.test.ts` | ❌ Wave 0 | ⬜ pending |
| AUTH-02 | Verification handles success, expired, used, invalid and same/cross-device branches; resend is server limited | API integration + Web E2E + client | `pnpm --filter api test --run test/auth/verify-email.int.test.ts` | ❌ Wave 0 | ⬜ pending |
| AUTH-03 | Verified login succeeds, unverified login is denied, session restores after restart, offline is distinct | API integration + client state + Web E2E | `pnpm --filter client test --runInBand session-bootstrap` | ❌ Wave 0 | ⬜ pending |
| AUTH-04 | Reset request is enumeration safe; token is expiring/single use; reset revokes all sessions | API integration + Web E2E | `pnpm --filter api test --run test/auth/password-reset.int.test.ts` | ❌ Wave 0 | ⬜ pending |
| AUTH-05 | Logout revokes only JWT `sid`; a second device remains authenticated | API integration | `pnpm --filter api test --run test/auth/logout.int.test.ts` | ❌ Wave 0 | ⬜ pending |
| AUTH-06 | Duplicate nicknames are allowed; current user can update only their own nickname | API integration + client component | `pnpm --filter api test --run test/users/me.int.test.ts` | ❌ Wave 0 | ⬜ pending |
| SAFE-03 | Native refresh uses SecureStore; Web refresh uses HttpOnly Cookie and never appears in JSON or localStorage | Adapter unit + Playwright cookie assertion | `pnpm --filter client test --runInBand session-transport` | ❌ Wave 0 | ⬜ pending |
| SAFE-04 | Every refresh rotates; known old-token replay revokes its session; database stores token hashes only | DB integration + concurrency/property cases | `pnpm --filter api test --run test/auth/refresh-rotation.int.test.ts` | ❌ Wave 0 | ⬜ pending |

## Required Scenario Matrix

| Area | Automated cases required before phase verification |
|------|----------------------------------------------------|
| Refresh | Success, expired, revoked, replay, unknown hash, two independent devices, simultaneous refresh, absolute expiry, password-reset global revoke |
| Link tokens | Valid, expired, used, unknown, superseded by resend, landing GET does not consume, token removed from URL and logs |
| Session bootstrap | No credential, valid, explicit 401, timeout, DNS/offline, 5xx, Web cookie, native SecureStore, safe intended-route restore |
| Enumeration | Existing/non-existing reset and registration have the same status/body shape; login uses generic invalid credentials; rate limit is stable |
| Cookie | HttpOnly, Secure outside local HTTP, SameSite=Lax, auth path, bounded Max-Age, exact-origin credentialed CORS, matching clear attributes, no refresh JSON field |
| UI contract | Input/button states, 320/390/768/1440 widths, 200% text, keyboard/focus order, live announcements, reduced motion, contrast tokens |

## Wave 0 Requirements

- [ ] Root `package.json`, `pnpm-workspace.yaml`, shared strict TypeScript configs and pinned `packageManager`.
- [ ] `compose.yaml` with PostgreSQL 18 and Mailpit health checks; `.env.test` contract without committed secrets.
- [ ] `apps/api/vitest.config.ts`, `apps/api/test/setup-integration.ts`, and deterministic database reset/migrate helper.
- [ ] `apps/client/jest.config.js`, React Native Testing Library setup, SecureStore mock and network mock.
- [ ] `playwright.config.ts` with Web/API server orchestration.
- [ ] API integration test files under `apps/api/test/auth/` for registration, verification, login, refresh rotation, reset and logout.
- [ ] `apps/api/test/users/me.int.test.ts` for nickname behavior.
- [ ] `apps/client/src/features/auth/__tests__/session-bootstrap-test.tsx`.
- [ ] `apps/client/src/platform/session/__tests__/session-transport-test.ts`.
- [ ] Web E2E files under `e2e/auth/` for registration, mail verification, login, reset, cookies and accessibility.
- [ ] OpenAPI generation drift check that fails when regeneration changes committed `packages/api-client` output.
- [ ] Human package checkpoint for research entries marked seam-SUS before dependency installation.

## Threat Verification

| Threat Ref | Threat | Blocking Assertion |
|------------|--------|--------------------|
| T-01 | Credential stuffing / enumeration | Generic status/body behavior and server-side per-IP/per-email throttling tests |
| T-02 | Refresh theft or replay | Atomic consume, retained generation, session-family revoke and two-device isolation tests |
| T-03 | Cookie CSRF / transport confusion | Exact Origin, credentialed CORS, cookie-source response mode and no Web refresh JSON tests |
| T-04 | Verification/reset token leakage | URL sanitization and structured-log redaction assertions; GET cannot consume token |
| T-05 | Password-reset partial failure | One transaction consumes token, changes hash and revokes every session |
| T-06 | Mass assignment | Whitelisted DTO and `/users/me` only permits `displayName` in Phase 1 |

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Native secret persistence | SAFE-03 | OS Keychain/Keystore behavior is not fully proven by a JS mock | On Android device/emulator: login, restart, confirm restore; inspect that AsyncStorage contains no refresh material; logout and confirm restore fails |
| Native verification deep link | AUTH-02 | App-link handoff varies by OS and installed build | Open a Mailpit verification link on Android, confirm sanitized route and same-device continuation; repeat from another browser/device and confirm login-required result |
| Keyboard and text scaling | AUTH-01, AUTH-04 | Layout/assistive behavior needs device observation | At 200% text scaling, exercise login/register/reset with keyboard open; confirm fields, errors and primary actions remain reachable |
| iOS SecureStore/deep-link smoke | SAFE-03, AUTH-02 | Windows cannot run Xcode/iOS simulator | Run on an iOS real device through EAS development build before Phase 6 release readiness |

## Validation Sign-Off

- [x] Every Phase 1 requirement has an automated command and planned Wave 0 file.
- [x] Sampling continuity permits no task to go three commits without automated verification.
- [x] Wave 0 covers every currently missing test/config reference.
- [x] Commands use one-shot modes and contain no watch flags.
- [x] Quick-loop target is under 30 seconds and wave target is under 5 minutes.
- [x] `nyquist_compliant: true` is set in frontmatter.

**Approval:** approved 2026-08-01; Wave 0 implementation pending
