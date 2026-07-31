---
phase: 1
slug: safe-account-entry
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-01
revised: 2026-08-01
---

# Phase 1 — Validation Strategy

## Test Infrastructure

| Layer | Runner | One-shot command |
|---|---|---|
| API/unit/integration | Vitest + Nest testing + Supertest | `pnpm --filter api test --run <path>` |
| Expo component/adapters | Jest Expo + RNTL | `pnpm --filter client test --runInBand <pattern>` |
| Web E2E/a11y | Playwright + axe | `pnpm exec playwright test <path>` |
| Database/email | PostgreSQL 18 + Mailpit | `pnpm test:integration` |
| Fast feedback | configured project selection | `pnpm test:quick` |

Every PowerShell verification uses `&&` under PowerShell 7, or checks `$LASTEXITCODE` and throws immediately after each native command. `scripts/assert-red.ps1` first proves runner/config/test discovery, rejects infrastructure/config/import failures, then accepts failure only when the named missing-behavior marker appears.

## Wave 0 File Contract

Every path below is created before behavior implementation. Test files may be executable skipped contracts until their owning RED plan activates them; they may not contain fake passing assertions.

### Workspace and runner paths — Plans 01-02, 01-03, and 01-04

- `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`
- `compose.yaml`, `.env.test.example`, `playwright.config.ts`
- `scripts/assert-red.ps1`, `scripts/check-required-tests.ps1`, `scripts/check-openapi-drift.ps1`
- `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`
- `apps/api/test/setup-integration.ts`, `apps/api/test/reset-database.ts`
- `apps/client/package.json`, `apps/client/app.json`, `apps/client/tsconfig.json`
- `apps/client/jest.config.js`, `apps/client/jest.setup.ts`

### API/security contract paths — Plans 01-05 and 01-06

- `apps/api/test/auth/register.int.test.ts`
- `apps/api/test/auth/verify-email.int.test.ts`
- `apps/api/test/auth/login.int.test.ts`
- `apps/api/test/auth/refresh-rotation.int.test.ts`
- `apps/api/test/auth/password-reset.int.test.ts`
- `apps/api/test/auth/logout.int.test.ts`
- `apps/api/test/users/me.int.test.ts`
- `apps/api/test/security/asvs-v5-l1.test.ts`
- `apps/api/src/modules/auth/data/common-passwords-top-3000.txt`
- `apps/api/src/modules/auth/data/common-passwords-SOURCE.md`
- `docs/security/asvs-v5.0.0-l1.md`

### Client and Web contract paths — Plans 01-07, 01-08, and 01-09

- `apps/client/src/features/auth/__tests__/register-form-test.tsx`
- `apps/client/src/features/auth/__tests__/verification-flow-test.tsx`
- `apps/client/src/features/auth/__tests__/session-bootstrap-test.tsx`
- `apps/client/src/features/auth/__tests__/password-reset-flow-test.tsx`
- `apps/client/src/platform/session/__tests__/session-transport-test.ts`
- `apps/client/src/features/profile/__tests__/profile-form-test.tsx`
- `apps/client/src/ui/__tests__/token-static-test.ts`
- `apps/client/src/ui/__tests__/contrast-test.ts`
- `apps/client/src/ui/__tests__/primitive-states-test.tsx`
- `e2e/auth/register.spec.ts`
- `e2e/auth/verify-email.spec.ts`
- `e2e/auth/login-session.spec.ts`
- `e2e/auth/password-reset.spec.ts`
- `e2e/auth/account-actions.spec.ts`
- `e2e/auth/accessibility.spec.ts`

## Requirement Verification Map

| Requirement | Primary tests | Required behavior |
|---|---|---|
| AUTH-01 | `register.int.test.ts`, `register-form-test.tsx`, `register.spec.ts` | canonical-email race safety; original delivery address; Argon2id; local common-password denial; D-02 registration |
| AUTH-02 | `verify-email.int.test.ts`, `verification-flow-test.tsx`, `verify-email.spec.ts` | valid/expired/used/invalid/superseded; registration-side proof; same/cross-device; API-issued Web pending cookie; native SecureStore proof |
| AUTH-03 | `login.int.test.ts`, `session-bootstrap-test.tsx`, `login-session.spec.ts` | verified login; restart; splash; offline/401/5xx distinction; no-household handoff only |
| AUTH-04 | `password-reset.int.test.ts`, `password-reset-flow-test.tsx`, `password-reset.spec.ts` | generic request; single-use expiry; common-password denial; atomic global revoke; no auto-login |
| AUTH-05 | `logout.int.test.ts`, `account-actions.spec.ts` | exact `sid`; current-device revoke; matching cookie clear; second device remains valid |
| AUTH-06 | `users/me.int.test.ts`, `profile-form-test.tsx`, `account-actions.spec.ts` | AppModule reachability; GET/PATCH subject isolation; duplicate display names; mass-assignment rejection |
| SAFE-03 | `session-transport-test.ts`, `login-session.spec.ts`, `verify-email.spec.ts` | SecureStore native; API-issued HttpOnly Web cookies; no refresh/pending proof in JSON or Web storage |
| SAFE-04 | `refresh-rotation.int.test.ts`, `asvs-v5-l1.test.ts` | rotation, retained hashes, replay revoke, concurrency, independent devices |

## UI and Accessibility Matrix

| Contract | Named assertion |
|---|---|
| Token-only styling | `token-static-test.ts` rejects raw color/spacing/radius/font literals outside theme-owned files |
| Measured contrast | `contrast-test.ts` computes WCAG ratios for text, controls, status, and focus tokens |
| Primitive states | `primitive-states-test.tsx` covers rest/focus/invalid/disabled/loading/password reveal/live status |
| Responsive Web | `accessibility.spec.ts` runs 320, 390, 768, and 1440 widths |
| Accessibility Web | axe at every width; keyboard order; first-invalid/status focus; live regions; 200% zoom |
| User preferences | reduced-motion removes translation/shortens opacity; forced colors hides decoration and preserves focus |

## Applicable OWASP ASVS 5.0.0 L1 Mapping

Identifiers are copied from the stable OWASP v5.0.0 CSV and use the required `v5.0.0-<id>` form. `docs/security/asvs-v5.0.0-l1.md` records exact text, applicability, owning assertion, and evidence; `asvs-v5-l1.test.ts` fails if an applicable row lacks a named test.

| Control | Phase 1 assertion |
|---|---|
| v5.0.0-2.2.1, v5.0.0-2.2.2 | DTO whitelist/range tests in register, reset, and users/me suites |
| v5.0.0-2.3.1 | verification/reset sequential and single-use transaction cases |
| v5.0.0-3.3.1 | production cookie name/prefix and Secure attribute HTTP test |
| v5.0.0-3.4.2 | exact-origin CORS test |
| v5.0.0-3.5.1, v5.0.0-3.5.2, v5.0.0-3.5.3 | credentialed-origin and POST-only auth mutation tests |
| v5.0.0-6.1.1, v5.0.0-6.3.1 | documented and implemented per-IP/per-account throttle tests |
| v5.0.0-6.2.1, v5.0.0-6.2.4, v5.0.0-6.2.5, v5.0.0-6.2.6, v5.0.0-6.2.7, v5.0.0-6.2.8 | length, top-3000 denylist, composition, mask/reveal, paste/password-manager, exact-input tests |
| v5.0.0-6.3.2, v5.0.0-6.4.1, v5.0.0-6.4.2 | no defaults/hints/questions; CSPRNG expiring verification activation token tests |
| v5.0.0-7.2.1..v5.0.0-7.2.4, v5.0.0-7.4.1 | backend validation, dynamic CSPRNG tokens, new generation, termination/revoke tests |
| v5.0.0-9.1.1..v5.0.0-9.1.3, v5.0.0-9.2.1 | JWT signature, algorithm/key allowlist, expiry tests |
| v5.0.0-10.4.5 | refresh rotation and known-replay family revoke tests |
| v5.0.0-11.4.1 | approved SHA-256 opaque-token hash test |
| v5.0.0-14.2.1, v5.0.0-14.3.1 | token-free post-landing URLs and client-storage clearing tests |

Source: `https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.csv`.

## Sampling and Final Gates

- After each task: `pnpm test:quick` plus the focused task command.
- After each wave: `pnpm test && pnpm test:integration`.
- Final automated gate: `pwsh -NoProfile -File scripts/check-required-tests.ps1 && pnpm test && pnpm test:integration && pnpm test:e2e:web && pnpm openapi:check`.
- The required-test audit enumerates every exact API, client, design, and E2E path in this document and fails before the suites if any path is absent or contains `.skip`, `.todo`, `test.todo`, `describe.skip`, or `IMPLEMENTATION_MISSING`.
- Final manual Android gate: SecureStore restart/clear, same-device deep link, offline-vs-expired, keyboard, 200% text, screen-reader announcements, and 48px targets.
- iOS EAS/real-device verification and production domains/SMTP/provider remain explicit Phase 6 release gates.

## Sign-Off

- [x] Every test/config path is assigned to an explicit Wave 0 plan.
- [x] RED verification distinguishes missing behavior from runner/config/discovery failure.
- [x] Every requirement and UI-SPEC verification row has a named suite.
- [x] Applicable ASVS identifiers are grounded in the official stable v5.0.0 CSV.
- [ ] Wave 0 implementation complete.
