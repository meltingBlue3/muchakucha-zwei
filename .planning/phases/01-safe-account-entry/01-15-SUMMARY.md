---
phase: 01-safe-account-entry
plan: 15
subsystem: ui
tags: [expo-router, react-native-web, react-hook-form, zod, playwright, registration]

requires:
  - phase: 01-safe-account-entry/01-12
    provides: Native PendingProofStore and Web credentialed-cookie capability boundary
  - phase: 01-safe-account-entry/01-13
    provides: Secure registration API and generated register operation
  - phase: 01-safe-account-entry/01-14
    provides: Typed warm theme and owned accessible primitives
provides:
  - Branded Expo Router registration and verification-pending routes
  - React Hook Form and Zod registration through the generated API client
  - Native proof persistence before navigation and Web HttpOnly-cookie-only continuation
  - Executable component and real-browser registration journeys
affects: [01-16, 01-17, registration-ui, verification-flow]

tech-stack:
  added: [react-native-web 0.21.2, react-dom 19.2.3]
  patterns:
    - Feature forms compose only owned primitives and generated API operations
    - Native continuation proof is durable before navigation while Web JavaScript never receives it

key-files:
  created:
    - apps/client/app/_layout.tsx
    - apps/client/app/index.tsx
    - apps/client/app/(auth)/register.tsx
    - apps/client/app/(auth)/verify-pending.tsx
    - apps/client/src/features/auth/register-form.tsx
  modified:
    - apps/client/src/features/auth/__tests__/register-form-test.tsx
    - e2e/auth/register.spec.ts
    - packages/api-client/src/generated/client.ts
    - playwright.config.ts
    - apps/client/package.json
    - pnpm-lock.yaml

key-decisions:
  - "Match the client Web renderer to the approved Expo SDK 57 React line with exact react-dom 19.2.3 and react-native-web 0.21.2 pins."
  - "Use extensionless generated-client imports with TypeScript Bundler resolution so the same generated package remains strict-typecheckable and consumable by Expo Metro."
  - "Write native pending proof before publishing accepted navigation; Web uses credentials include and exposes no JavaScript proof accessor."

patterns-established:
  - "Registration form boundary: local Zod validation, safe server-field mapping, stable loading action, and original delivery email handoff."
  - "Cross-platform continuation: native PendingProofStore write precedes route change; Web trusts only the API-owned HttpOnly cookie."

requirements-completed: [AUTH-01]

coverage:
  - id: D1
    description: "A branded single-page registration form submits through the generated client and reaches the verification-pending route with the original delivery address."
    requirement: AUTH-01
    verification:
      - kind: unit
        ref: "apps/client/src/features/auth/__tests__/register-form-test.tsx (6 passed)"
        status: pass
      - kind: e2e
        ref: "e2e/auth/register.spec.ts#registers through the real form and reaches verification pending (pass)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Native registration persists the API-issued pending proof before navigation while Web remains credentialed-cookie-only with no JavaScript secret storage."
    requirement: AUTH-01
    verification:
      - kind: unit
        ref: "apps/client/src/features/auth/__tests__/register-form-test.tsx#D-06 native and Web proof boundaries"
        status: pass
      - kind: e2e
        ref: "e2e/auth/register.spec.ts#real Web registration journey"
        status: pass
    human_judgment: false
  - id: D3
    description: "Registration preserves password-manager metadata, paste, reveal focus, accessible errors, loading semantics, typed theme ownership, and responsive auth composition."
    requirement: AUTH-01
    verification:
      - kind: unit
        ref: "pnpm --filter client test --runInBand (42 passed; 33 downstream cases skipped)"
        status: pass
      - kind: e2e
        ref: "e2e/auth/register.spec.ts#keeps password-manager, paste, and reveal behavior available (pass)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The generated registration client is consumable by Expo Web with the exact React peer set and remains deterministic under the OpenAPI drift gate."
    requirement: AUTH-01
    verification:
      - kind: other
        ref: "pnpm openapi:check"
        status: pass
      - kind: other
        ref: "pnpm --filter client typecheck && pnpm --filter @muchakucha/api-client typecheck"
        status: pass
    human_judgment: false

duration: 26min
completed: 2026-08-01
status: complete
---

# Phase 01 Plan 15: Registration Walking Skeleton Summary

**A branded Expo registration form now calls the generated API client, persists native continuation proof before navigation, keeps Web proof HttpOnly-only, and reaches verification pending in a real browser.**

## Performance

- **Duration:** 26 min
- **Started:** 2026-08-01T05:44:46Z
- **Completed:** 2026-08-01T06:10:03Z
- **Tasks:** 2
- **Files modified:** 18

## Accomplishments

- Delivered Expo Router entry, registration, and verification-pending routes composed exclusively from the approved owned primitives.
- Implemented a React Hook Form and Zod registration boundary with interaction-aware validation, safe API errors, stable loading behavior, autocomplete, paste, and reveal focus retention.
- Connected the generated `register` operation so native writes the returned proof through `PendingProofStore` before navigation while Web relies only on the API-issued HttpOnly cookie.
- Activated and passed six component cases, two real Playwright journeys, the complete client design regression, strict typechecks, and deterministic OpenAPI generation.

## Task Commits

Each task was committed atomically:

1. **Task 1: Turn registration and UI contracts RED** - `f32b21d` (test)
2. **Task 2: Build the registration walking skeleton UI** - `3e1f81b` (feat)

## Files Created/Modified

- `apps/client/app/_layout.tsx` - Root theme provider and headerless Expo Router stack.
- `apps/client/app/index.tsx` - Default unauthenticated redirect into registration.
- `apps/client/app/(auth)/register.tsx` - Platform-aware generated-client registration route.
- `apps/client/app/(auth)/verify-pending.tsx` - Target-email and open-mail verification waiting route.
- `apps/client/src/features/auth/register-form.tsx` - Validated registration form and native/Web continuation boundary.
- `apps/client/src/features/auth/__tests__/register-form-test.tsx` - Six executable validation, loading, error, proof, and handoff contracts.
- `e2e/auth/register.spec.ts` - Two real Web registration and password-input journeys.
- `apps/api/src/openapi/generate-openapi.ts` / `packages/api-client/src/generated/*` - Expo-consumable deterministic generated client imports.
- `apps/client/package.json` / `pnpm-lock.yaml` - Exact Expo Web renderer peers and generated-client workspace dependency.
- `playwright.config.ts` / `scripts/assert-red.ps1` - Self-starting real-browser verification and exact RED support.

## Decisions Made

- Pinned the client Web renderer to `react-dom@19.2.3` and `react-native-web@0.21.2`, matching the approved React 19.2.3 Expo SDK 57 template line.
- Kept the generated package as the only API access path and changed its source generator plus TypeScript resolution together, avoiding hand-edited generated drift or Prisma coupling.
- Kept Web continuation capability-only: the generated request includes credentials, but no Web route, form, or adapter can read or store the pending proof.

## TDD Gate Compliance

- **RED:** `f32b21d` followed independent component and Playwright discovery and failed only with `IMPLEMENTATION_MISSING_REGISTER_UI`.
- **GREEN:** `3e1f81b` removed the marker, implemented the real routes/form/client boundary, and made the same component and E2E suites pass.
- **REFACTOR:** No separate refactor commit was needed; full client regression, strict typechecks, quick tests, frozen installation, and OpenAPI drift verification pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made Playwright RED and GREEN self-starting**

- **Found during:** Task 1
- **Issue:** The browser contract had no runnable Expo Web dependency/runtime or automatic API and client server lifecycle, so failures were infrastructure-only.
- **Fix:** Added the exact authorized `react-native-web@0.21.2`, client build ignores, API dev entrypoint, Playwright web servers, and E2E-aware RED runner support.
- **Files modified:** `apps/client/package.json`, `pnpm-lock.yaml`, `apps/client/.gitignore`, `apps/api/package.json`, `playwright.config.ts`, `scripts/assert-red.ps1`, `apps/client/tsconfig.json`
- **Verification:** Both RED suites were independently discovered and failed only on the exact missing-behavior marker.
- **Committed in:** `f32b21d`

**2. [Rule 3 - Blocking] Matched the Expo Web React renderer peer**

- **Found during:** Task 2 E2E startup
- **Issue:** The resolved `react-dom@19.2.8` renderer did not match the approved client `react@19.2.3`, preventing a valid Expo Web runtime.
- **Fix:** After explicit package verification, installed only exact `react-dom@19.2.3` in the client workspace.
- **Files modified:** `apps/client/package.json`, `pnpm-lock.yaml`
- **Verification:** Client dependency listing resolves React and React DOM both at 19.2.3; frozen offline installation and Playwright pass.
- **Committed in:** `3e1f81b`

**3. [Rule 3 - Blocking] Made the generated client consumable by Expo Metro**

- **Found during:** Task 2 implementation
- **Issue:** NodeNext `.js` source specifiers in the TypeScript generated package were not resolved by the Expo source-workspace bundler boundary.
- **Fix:** Updated the generator and generated barrel/client imports together to extensionless specifiers and used TypeScript Bundler resolution for the generated package.
- **Files modified:** `apps/api/src/openapi/generate-openapi.ts`, `packages/api-client/src/generated/client.ts`, `packages/api-client/src/generated/index.ts`, `packages/api-client/tsconfig.json`
- **Verification:** Client and generated-package strict typechecks pass; `pnpm openapi:check` reports a deterministic committed tree.
- **Committed in:** `3e1f81b`

**4. [Rule 1 - Bug] Corrected browser reveal assertions to the accessibility contract**

- **Found during:** Task 2 E2E GREEN verification
- **Issue:** React Native Web correctly omitted the default `type="text"` attribute after reveal and restored focus to the password input, while the scaffold asserted a literal attribute and button focus contrary to “reveal without focus loss.”
- **Fix:** Asserted the live DOM `input.type` property and retained password-input focus.
- **Files modified:** `e2e/auth/register.spec.ts`
- **Verification:** The password-manager, paste, reveal, action-label, and focus journey passes in Chromium.
- **Committed in:** `3e1f81b`

**5. [Rule 1 - Bug] Corrected canonical progress persistence after the SDK wrote zero**

- **Found during:** Plan close-out
- **Issue:** `state.update-progress` correctly reported 15/27 and 56% but persisted `percent: 0` in STATE frontmatter.
- **Fix:** Applied the handler's own reported canonical percentage after all SDK-owned state, roadmap, metric, decision, requirement, and session updates completed.
- **Files modified:** `.planning/STATE.md`
- **Verification:** STATE records Plan 16 of 27, 15 completed plans, and 56% consistently; ROADMAP records 15/27.
- **Committed in:** Plan tracking synchronization commit.

---

**Total deviations:** 5 auto-fixed (2 bugs, 3 blocking issues).
**Impact on plan:** Every change was required to make the planned generated-client Web journey executable and truthful; the authentication scope and secret ownership model did not expand.

## Issues Encountered

- The first exact `react-dom@19.2.3` install attempt was terminated by the command timeout without mutating the manifest; the explicitly authorized identical package/version succeeded on the second attempt.
- Playwright initially used the dormant default PostgreSQL port 55432. Verification was rerun against the already prepared, migrated Plan 01-15 PostgreSQL 18 container on isolated port 55442; no production or committed database configuration changed.
- OpenAPI drift verification intentionally failed before the task commit because it compares generated output to `HEAD`; it passed immediately after the atomic generated-source commit.

## User Setup Required

None - no production origin, SMTP provider, or external credential is required.

## Known Stubs

- `apps/client/app/(auth)/verify-pending.tsx` currently presents informational resend copy only. The interactive authoritative countdown/resend flow is intentionally owned by Plan 01-17 after Plan 01-16 adds the transactional resend API; this does not block the Plan 01-15 registration-to-pending goal.

## Next Phase Readiness

- Plan 01-16 can add generated complete/resend operations without changing registration form ownership.
- Plan 01-17 can replace the pending-page informational resend boundary with authoritative countdown/resend behavior and consume the already persisted native proof.
- No unresolved blocker remains for the verification wave.

## Self-Check: PASSED

- All five created route/form files exist, and all 18 plan-touched files are committed with no tracked deletion or untracked output.
- RED commit `f32b21d` precedes GREEN commit `3e1f81b` and both exist in repository history.
- Registration component tests pass 6/6; real Playwright registration passes 2/2; the full client suite passes 42 tests with only downstream Wave 0 cases skipped.
- Client and generated-client strict typechecks, repository quick tests, frozen offline install, and the post-commit OpenAPI drift gate pass.
- Static scans find no registration marker, local/session storage, Web proof accessor, goal-blocking stub, or unplanned threat surface.

---
*Phase: 01-safe-account-entry*
*Completed: 2026-08-01*
