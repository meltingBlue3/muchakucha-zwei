---
phase: 07-recurring-events-tasks
plan: 07
subsystem: ui
tags: [react-native, expo-router, accessibility, recurrence, modal, restyle]
requires:
  - phase: 07-04
    provides: Atomic this-only and this-and-following event/task series mutation APIs
  - phase: 07-05
    provides: Typed recurrence form values and response normalization
  - phase: 07-06
    provides: Recurring-instance presentation and cancellation-safe list behavior
provides:
  - Accessible cross-platform SeriesScopeSheet with explicit scope selection
  - Recurring event and task edit/delete routing through authoritative series APIs
  - Watermark-aware event and task empty states for the rolling generation window
affects: [07-08, recurring-series-client, accessibility-e2e]
tech-stack:
  added: []
  patterns: [pending-action write gate, modal focus containment, authority-watermark empty state]
key-files:
  created:
    - apps/client/src/features/recurrence/series-scope-sheet.tsx
    - apps/client/src/features/recurrence/__tests__/series-scope-dialog-test.tsx
  modified:
    - apps/client/app/(protected)/households/[id]/events/[eventId]/edit.tsx
    - apps/client/app/(protected)/households/[id]/tasks/[taskId]/edit.tsx
    - apps/client/app/(protected)/households/[id]/events/index.tsx
    - apps/client/app/(protected)/households/[id]/tasks/index.tsx
key-decisions:
  - "Recurring writes are held as typed pending actions until the user explicitly selects this_only or this_and_following."
  - "Rule-change mode is derived by comparing the normalized submitted recurrence with the server response rather than using a destructive default."
  - "Generation-window empty states compare the selected calendar date, or today's task-list date, with the household materialization watermark."
patterns-established:
  - "Series mutation UI stores intent without writing, then dispatches exactly from the selected scope."
  - "Web modals capture and restore trigger focus, trap Tab navigation, close on Escape, and unmount when hidden."
requirements-completed: [RECR-02]
coverage:
  - id: D1
    description: "SeriesScopeSheet exposes only explicit this-only and following scopes with locked mode copy, busy states, failure retention, and unmount behavior."
    requirement: RECR-02
    verification:
      - kind: unit
        ref: "apps/client/src/features/recurrence/__tests__/series-scope-dialog-test.tsx (10 tests)"
        status: pass
      - kind: other
        ref: "pnpm --filter client typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: "Recurring event and task saves/deletes wait for scope and route the chosen operation through the server-owned mutation boundary."
    requirement: RECR-02
    verification:
      - kind: other
        ref: "Client full suite: 196 passed, 2 intentionally skipped"
        status: pass
    human_judgment: true
    rationale: "Final route-level focus return and navigation behavior require browser/native interaction in Plan 07-08."
  - id: D3
    description: "Event and task lists distinguish ordinary emptiness from dates beyond a non-null materialization watermark without exposing manual generation."
    requirement: RECR-02
    verification:
      - kind: other
        ref: "Static watermark/copy/no-manual-generation acceptance sweep"
        status: pass
    human_judgment: true
    rationale: "The selected-date visual branch and responsive StatusPanel placement need cross-platform UI verification."
  - id: D4
    description: "The scope sheet remains scrollable and all actions reachable at 320px width and 200% font scaling on Web and native."
    requirement: RECR-02
    verification: []
    human_judgment: true
    rationale: "This is the UI-SPEC backstop requiring Web and real-device visual verification."
duration: 13min
completed: 2026-08-12
status: complete
---

# Phase 7 Plan 7: Explicit Series Scope and Generation-Window UI Summary

**Accessible explicit-scope mutation sheets now protect recurring event/task writes, while watermark-aware lists explain when farther recurrences have not been generated yet.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-08-12T05:10:35Z
- **Completed:** 2026-08-12T05:23:01Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added one shared typed `SeriesScopeSheet` for edit, delete, and rule-change modes with modal unmounting, themed geometry, safe-area padding, busy/error states, Web focus trapping, Escape close, and focus return.
- Wired recurring event and task saves/deletes through a no-write-before-selection pending-action boundary while preserving ordinary item confirmation and navigation paths.
- Added dedicated event/task empty states when the viewed date is beyond a non-null household generation watermark, without a manual generation action.

## Task Commits

1. **Task 1 RED: Series scope behavior contract** - `152ca91` (test)
2. **Task 1 GREEN: Accessible SeriesScopeSheet** - `d745899` (feat)
3. **Task 2: Event/task edit-page scope wiring** - `64a016f` (feat)
4. **Task 3: Generation-window empty states** - `bcd0142` (feat)
5. **Verification fix: Locked copy alignment** - `f72ee0c` (fix)

## Files Created/Modified

- `apps/client/src/features/recurrence/series-scope-sheet.tsx` - shared modal, mode treatments, focus lifecycle, busy state, and atomic error presentation.
- `apps/client/src/features/recurrence/__tests__/series-scope-dialog-test.tsx` - explicit-selection, scope count/order, mode, busy, failure, unmount, and geometry assertions.
- `apps/client/app/(protected)/households/[id]/events/[eventId]/edit.tsx` - recurring event scope gating and authoritative refresh after failures.
- `apps/client/app/(protected)/households/[id]/tasks/[taskId]/edit.tsx` - recurring task scope gating with runtime-narrowed series payloads.
- `apps/client/app/(protected)/households/[id]/events/index.tsx` - selected-date watermark empty-state branch.
- `apps/client/app/(protected)/households/[id]/tasks/index.tsx` - current-date watermark empty-state branch.

## Decisions Made

- A recurring form submit records the validated payload as pending UI state and performs no write until a scope action is pressed.
- Recurrence equality compares normalized response/input objects so an actual rule edit cannot silently use the edit-mode default.
- Filter-created emptiness retains the existing filtered message; the generation-window explanation is reserved for unfiltered empty results beyond authority.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Narrowed task form strings to the generated series vocabulary**
- **Found during:** Task 2 typechecking
- **Issue:** `CreateTaskDto` intentionally exposes broad string fields while `UpdateSeriesDto` requires canonical status and priority unions, so direct forwarding failed strict TypeScript.
- **Fix:** Added a runtime-whitelisted `taskSeriesUpdate` adapter that only emits canonical values and preserves exact optional-property semantics.
- **Files modified:** `apps/client/app/(protected)/households/[id]/tasks/[taskId]/edit.tsx`
- **Verification:** `pnpm --filter client typecheck` passes and the full client suite is green.
- **Committed in:** `64a016f`

**2. [Rule 1 - Contract bug] Aligned locked delete/rule-change copy and removed a duplicate failure heading**
- **Found during:** Overall UI-SPEC verification
- **Issue:** The first implementation conveyed the correct meaning but did not match the locked copy byte-for-byte and repeated “没有完成” in the Banner.
- **Fix:** Applied the exact Copywriting Contract strings and rendered the atomic error once.
- **Files modified:** `apps/client/src/features/recurrence/series-scope-sheet.tsx`, `apps/client/src/features/recurrence/__tests__/series-scope-dialog-test.tsx`
- **Verification:** Scope tests (10/10), full client tests, and typechecking pass.
- **Committed in:** `f72ee0c`

---

**Total deviations:** 2 auto-fixed (1 blocking type mismatch, 1 copy/UX contract bug).
**Impact on plan:** Both fixes enforce existing generated types and locked UI contracts; no dependency, endpoint, schema, or architecture changes were added.

## Issues Encountered

- React Native Testing Library's current async renderer requires awaiting `render`, and `useSafeAreaInsets` requires a provider in component tests. The GREEN implementation tests were adjusted to use the same safe-area context the app supplies.

## Known Stubs

None. Stub-pattern matches were state initialization, null guards, or intentional empty collection accumulators; no placeholder data flows to rendered UI.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 07-08 can exercise route-level browser journeys, keyboard focus, 320px/200% scaling, and Android safe-area behavior.
- The UI-SPEC human backstop for 320px width plus 200% font scaling remains intentionally routed to Plan 07-08; automated contracts are green.

## Self-Check: PASSED

- All six created/modified implementation files exist.
- All five plan commits are present in git history.
- Client typecheck passes with zero errors.
- Client tests pass: 21 suites, 196 passed, 2 intentionally skipped.
- Every plan acceptance static check passed; package and lockfile diffs are empty.
- No new network endpoint, authentication path, filesystem access, schema boundary, dependency, or unmodeled threat surface was introduced.

---
*Phase: 07-recurring-events-tasks*
*Completed: 2026-08-12*
