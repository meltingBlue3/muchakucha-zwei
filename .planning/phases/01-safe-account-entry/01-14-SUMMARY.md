---
phase: 01-safe-account-entry
plan: 14
subsystem: ui
tags: [restyle, react-native, design-tokens, accessibility, wcag, lucide]

requires:
  - phase: 01-safe-account-entry/01-08
    provides: Three discovered D-14 through D-17 design-system contract suites
provides:
  - Exact typed Muchakucha warm theme with semantic palette, spacing, typography, geometry, focus, elevation, and motion tokens
  - Complete owned cross-platform primitive surface for auth and profile composition
  - Twenty-five executable measured design, contrast, state, semantics, and geometry assertions
affects: [01-15, 01-17, 01-21, 01-23, 01-25, 01-26]

tech-stack:
  added: [@types/react 19.2.18]
  patterns:
    - Feature screens consume only typed Restyle tokens and owned primitives
    - Accessibility contracts use computed ratios, rendered semantics, and measured geometry

key-files:
  created:
    - apps/client/src/ui/theme.ts
    - apps/client/src/ui/primitives.tsx
  modified:
    - apps/client/src/ui/__tests__/token-static-test.ts
    - apps/client/src/ui/__tests__/contrast-test.ts
    - apps/client/src/ui/__tests__/primitive-states-test.tsx
    - scripts/assert-red.ps1
    - apps/client/jest.config.js
    - apps/client/package.json
    - pnpm-lock.yaml

key-decisions:
  - "Keep all visual values in the Restyle theme while the owned primitive layer exposes the exact D-14 through D-17 component contract."
  - "Use explicit Lucide icon subpath imports with a test-only CommonJS resolver so Metro remains tree-shakeable and Jest remains executable."
  - "Encode reduced-motion and forced-colors behavior as deterministic primitive helpers while rendering no distracting large illustration."

patterns-established:
  - "Typed visual boundary: raw palette, spacing, radius, typography, and geometry values live only in theme.ts."
  - "Accessible control contract: persistent labels, stable loading copy, live feedback, 48px targets, and 52px primary controls are primitive-owned."

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06]

coverage:
  - id: D1
    description: "The exact warm, modern, restrained D-14 through D-17 token system is typed and enforced as the only raw visual-value boundary."
    requirement: AUTH-01
    verification:
      - kind: unit
        ref: "apps/client/src/ui/__tests__/token-static-test.ts (8 passed)"
        status: pass
      - kind: other
        ref: "pnpm --filter client typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: "Palette pairs, controls, focus, pressed actions, statuses, and disabled treatment meet computed WCAG 2.2 AA thresholds."
    requirement: AUTH-03
    verification:
      - kind: unit
        ref: "apps/client/src/ui/__tests__/contrast-test.ts (6 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "All required primitives own accessible states, live semantics, password reveal, stable loading, touch geometry, scaling, and preference behavior."
    requirement: AUTH-06
    verification:
      - kind: unit
        ref: "apps/client/src/ui/__tests__/primitive-states-test.tsx (11 passed)"
        status: pass
      - kind: unit
        ref: "pnpm --filter client test --runInBand (25 passed; 47 downstream Wave 0 cases skipped)"
        status: pass
    human_judgment: false

duration: 17min
completed: 2026-08-01
status: complete
---

# Phase 01 Plan 14: Typed Shared Theme and Accessible Primitives Summary

**A typed Restyle warm theme and sixteen owned React Native primitives now enforce measured WCAG contrast, accessible interaction states, and mobile-first geometry across Android, iOS, and Web.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-08-01T04:07:00Z
- **Completed:** 2026-08-01T04:24:18Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Implemented the exact cream/coral/ink/teal palette, spacing, typography, radii, borders, focus, light elevation, geometry, layout, and motion tokens as one typed Restyle theme.
- Built `Screen`, layout/text primitives, controls, fields, feedback, brand, auth-shell, link, loading, and page-status primitives with persistent labels, stable loading copy, live semantics, password reveal focus retention, and individual Lucide icon imports.
- Replaced all 25 missing-behavior markers with executable token, computed contrast, component-state, semantics, geometry, text-scaling, reduced-motion, and forced-colors assertions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Activate every design-system RED suite** - `82bc886` (test)
2. **Task 2: Implement typed theme and owned primitives** - `f07282f` (feat)

## Files Created/Modified

- `apps/client/src/ui/theme.ts` - Exact typed visual, geometry, focus, elevation, and motion tokens.
- `apps/client/src/ui/primitives.tsx` - Complete owned accessible component surface for downstream auth/profile screens.
- `apps/client/src/ui/__tests__/token-static-test.ts` - Executable token ownership and D-14/D-16/D-17 composition contracts.
- `apps/client/src/ui/__tests__/contrast-test.ts` - Computed WCAG 2.2 AA palette assertions.
- `apps/client/src/ui/__tests__/primitive-states-test.tsx` - Rendered primitive semantics, states, geometry, scaling, and preference tests.
- `scripts/assert-red.ps1` - Client Jest support for discovery-first exact RED evidence.
- `apps/client/jest.config.js` - Test-only resolver for individually imported Lucide CommonJS modules.
- `apps/client/package.json` / `pnpm-lock.yaml` - Direct strict React type ownership using the already locked official package.

## Decisions Made

- Kept the theme as the only raw visual-value owner; primitives consume typed tokens and downstream feature screens consume primitives.
- Used individually imported Lucide icon subpaths, mapped to their shipped CommonJS files only under Jest, preserving Metro's normal React Native ESM resolution.
- Represented preference behavior with deterministic helpers: reduced motion selects the shortened duration and either reduced motion or forced colors suppresses optional abstract color fields.

## TDD Gate Compliance

- **RED:** `82bc886` follows three independently discovered suites failing only with `IMPLEMENTATION_MISSING_DESIGN_SYSTEM`.
- **GREEN:** `f07282f` replaces every marker with executable assertions; all 25 focused tests and strict TypeScript pass.
- **REFACTOR:** No separate refactor commit was needed; the GREEN implementation remained within the owned theme/primitive boundary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Restored client support in the shared RED gate**

- **Found during:** Task 1
- **Issue:** `scripts/assert-red.ps1` accepted only `-Suite api`, so the plan's exact three client commands failed before discovery.
- **Fix:** Added a discovery-first client Jest runner and asynchronous output capture while preserving the existing API Vitest behavior.
- **Files modified:** `scripts/assert-red.ps1`
- **Verification:** All three planned `-Suite client` invocations independently reported valid exact-marker RED evidence.
- **Committed in:** `82bc886`

**2. [Rule 3 - Blocking] Added direct React type ownership for strict TSX**

- **Found during:** Task 2 typecheck
- **Issue:** The scaffold had Jest types but no direct React declarations because earlier `.tsx` contracts contained no JSX; the real component layer could not compile in strict mode.
- **Fix:** Added the already locked official `@types/react@19.2.18` package offline and refreshed only the client lockfile importer.
- **Files modified:** `apps/client/package.json`, `pnpm-lock.yaml`
- **Verification:** Strict client TypeScript and frozen offline install pass.
- **Committed in:** `f07282f`

**3. [Rule 3 - Blocking] Made individual Lucide subpaths executable under Jest**

- **Found during:** Task 2 component test execution
- **Issue:** Jest selected Lucide's React Native ESM condition and could not parse its `.mjs` subpath, although Metro supports that production path.
- **Fix:** Added a test-only module mapper to the package's shipped CommonJS icon files; production imports remain individual React Native subpaths.
- **Files modified:** `apps/client/jest.config.js`
- **Verification:** Primitive tests and the complete client suite pass with the individual imports.
- **Committed in:** `f07282f`

---

**Total deviations:** 3 auto-fixed (3 blocking issues).
**Impact on plan:** The fixes make the exact planned RED/GREEN commands and strict owned component layer executable without changing visual scope or substituting dependencies.

## Issues Encountered

- React Native 0.86 emits a deprecation notice for its built-in `SafeAreaView`; it remains the available direct dependency boundary in this plan. A future app-shell owner may move to an explicitly approved safe-area package without changing the `Screen` API.

## User Setup Required

None - no external services or secrets are required.

## Known Stubs

None - every Plan 01-14 marker was removed, all required primitives are implemented, and no empty/mock data flows to UI rendering.

## Next Phase Readiness

- Plans 01-15 onward can compose auth/profile routes exclusively from the typed primitives without raw visual literals.
- The complete 25-test design contract is green and ready for browser accessibility activation in Plan 01-26.

## Self-Check: PASSED

- Both created source files and all modified contract/config files exist.
- Task commits `82bc886` and `f07282f` exist in repository history in RED-then-GREEN order.
- Focused design tests pass 25/25; strict client TypeScript passes; the complete client suite reports only the 47 downstream Wave 0 skips.
- Frozen offline workspace installation succeeds, no design-system marker remains, and no tracked file deletion occurred.

---
*Phase: 01-safe-account-entry*
*Completed: 2026-08-01*
