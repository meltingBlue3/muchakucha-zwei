---
phase: 07-recurring-events-tasks
plan: 06
subsystem: ui
tags: [react-native, recurrence, accessibility, cards, details, tdd]
requires:
  - phase: 07-03
    provides: Recurrence-aware generated event and task response contracts
  - phase: 07-05
    provides: Canonical Chinese recurrence formatter and response normalization
provides:
  - Accessible muted recurrence badges on event and task cards
  - Recurrence summaries and explicit cancellation state on event and task details
  - Cancellation-safe Today partitions and task status transitions
affects: [07-07, 07-08, recurring-series-client, today-view]
tech-stack:
  added: []
  patterns: [single-path recurrence decoration, canonical recurrence formatting, cancellation-first partition guard]
key-files:
  created:
    - apps/client/src/features/recurrence/recurrence-badge.tsx
    - apps/client/src/features/tasks/__tests__/task-status-test.tsx
  modified:
    - apps/client/src/features/events/event-card.tsx
    - apps/client/src/features/tasks/task-card.tsx
    - apps/client/app/(protected)/households/[id]/events/[eventId]/index.tsx
    - apps/client/app/(protected)/households/[id]/tasks/[taskId]/index.tsx
    - apps/client/app/(protected)/households/[id]/today.tsx
key-decisions:
  - "Recurrence remains a single rendering path: cards only decorate the existing time or badge row with a muted icon."
  - "Cancelled tasks are rejected before every Today deadline classifier and return no next status, preventing accidental resurrection."
patterns-established:
  - "Cancellation fan-out uses a guard before classification or mutation, while detail deep links remain readable and explicit."
requirements-completed: [RECR-01, RECR-02]
coverage:
  - id: D1
    description: "Recurring event and task cards expose a muted Repeat marker and expanded accessibility label without a second card rendering path."
    requirement: RECR-01
    verification:
      - kind: other
        ref: "pnpm --filter client test && pnpm --filter client typecheck"
        status: pass
    human_judgment: true
    rationale: "Unchanged card height and wrapping quality at narrow widths require the end-of-phase visual backstop specified by 07-UI-SPEC."
  - id: D2
    description: "Event and task details show the canonical Chinese recurrence summary, clamp/timezone notes, and explicit cancellation state for deep-linked instances."
    requirement: RECR-01
    verification:
      - kind: other
        ref: "pnpm --filter client test && pnpm --filter client typecheck"
        status: pass
    human_judgment: true
    rationale: "Information-block placement and long-text readability require visual confirmation at supported text scales."
  - id: D3
    description: "Cancelled tasks are absent from every Today partition and cannot be revived through the status-cycle control."
    requirement: RECR-02
    verification:
      - kind: automated_ui
        ref: "apps/client/src/features/tasks/__tests__/task-status-test.tsx#cancelled task status"
        status: pass
      - kind: other
        ref: "pnpm --filter client typecheck"
        status: pass
    human_judgment: false
metrics:
  duration: 18min
  completed: 2026-08-12
status: complete
---

# Phase 7 Plan 6: Recurring Instance Presentation Summary

**Recurring events and tasks now carry accessible muted badges and canonical detail summaries, while cancelled occurrences stay visible on deep links but cannot leak into or revive from Today.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-08-12T03:15:00Z
- **Completed:** 2026-08-12T03:33:28Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added a theme-owned 14px recurrence badge and wired it into existing event/task card rows without touching the month calendar or introducing a parallel card path.
- Added non-color-only cancelled-task presentation with Ban icon, text, title strikethrough, reduced opacity, and a disabled accessible status control.
- Added recurrence summary, monthly clamp, timezone, and cancellation information to event and task details using the Plan 07-05 canonical formatter.
- Excluded cancelled tasks before all Today deadline partitions and made their status transition a tested no-op.

## Task Commits

1. **Task 1: Recurrence and cancellation card presentation** - `8e6f58f`
2. **Task 2: Recurrence and cancellation detail presentation** - `9a83642`
3. **Task 3 RED: Cancelled task behavior contracts** - `8f83d51`
4. **Task 3 GREEN: Today cancellation guards** - `f05ddc6`

## Files Created/Modified

- `apps/client/src/features/recurrence/recurrence-badge.tsx` - muted, accessible Repeat icon for recurring instances.
- `apps/client/src/features/events/event-card.tsx` - recurrence badge and expanded screen-reader label on the existing time row.
- `apps/client/src/features/tasks/task-card.tsx` - recurrence badge plus icon/text/strikethrough cancellation state and disabled status control.
- `apps/client/app/(protected)/households/[id]/events/[eventId]/index.tsx` - canonical recurrence information and deep-linked cancelled-event explanation.
- `apps/client/app/(protected)/households/[id]/tasks/[taskId]/index.tsx` - canonical recurrence information and cancelled-task detail state.
- `apps/client/app/(protected)/households/[id]/today.tsx` - reusable partition/status helpers with cancellation-first guards.
- `apps/client/src/features/tasks/__tests__/task-status-test.tsx` - Today exclusion, no-op transition, regression, and accessible card assertions.

## Decisions Made

- Kept recurrence purely decorative on cards: one shared `RecurrenceBadge` appears inside existing rows, and the month calendar remains byte-untouched.
- Normalized generated recurrence responses before calling the shared formatter, preserving the exact optional-property contract and avoiding duplicate summary copy.
- Represented a cancelled status-cycle result as `null` and returned before mutation state or API work begins, making the no-request guarantee explicit.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first close-out Git range check used PowerShell syntax that Git parsed as separate arguments. It changed no files; the check was rerun with a quoted range and confirmed both RED and GREEN commits in order.

## User Setup Required

None - no external services or new dependencies were introduced.

## Known Stubs

None. Empty partition arrays are populated by the same loop before rendering and are not placeholder UI data.

## Threat Flags

None. The plan adds no endpoint, authentication path, file access boundary, schema change, or dependency; server-authoritative household authorization and deep-link lookup behavior remain unchanged.

## Verification

- `pnpm --filter client test` - 20 suites passed; 186 tests passed and 2 pre-existing tests remained skipped.
- `pnpm --filter client typecheck` - passed with zero errors.
- `pnpm --filter client test -- task-status` - 6 cancellation behavior tests passed after a recorded RED failure for missing production guards.
- Month calendar, `apps/client/package.json`, and `pnpm-lock.yaml` are unchanged from the plan base.
- Acceptance scans confirmed both cards use `RecurrenceBadge`, cancelled cards include text and strikethrough, details use the canonical formatter, Today has both cancellation guards, and no raw badge colors or coral recurrence accent were introduced.

## Next Phase Readiness

- Plan 07-07 can wire series-scope dialogs onto edits and deletes with recurring instances now visibly identified.
- Narrow-card wrapping and long detail text at 200% scaling remain routed to the end-of-phase visual accessibility backstop.

## Self-Check: PASSED

- All seven declared created/modified files exist.
- Task commits `8e6f58f`, `9a83642`, `8f83d51`, and `f05ddc6` exist in history, with Task 3 RED preceding GREEN.
- Full client tests, typecheck, acceptance scans, no-dependency gate, stub scan, and threat-surface scan passed.
- No tracked files were deleted and no generated untracked files were introduced.
- The user-owned `.planning/quick/` directory remains untouched.

---
*Phase: 07-recurring-events-tasks*
*Completed: 2026-08-12*
