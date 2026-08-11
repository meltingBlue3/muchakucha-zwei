---
phase: 07
slug: recurring-events-tasks
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-12
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (API)** | Vitest 4.1.10, two named projects: `unit` and `integration` |
| **Config file (API)** | `apps/api/vitest.config.ts` |
| **Framework (client)** | Jest 30.4.2 + `jest-expo` 57.0.3 + `@testing-library/react-native` 14.0.1 |
| **Config file (client)** | `apps/client/jest.config.js` (glob uses `-test` suffix, not `.test.`) |
| **E2E** | Playwright 1.62.1, `playwright.config.ts` at repo root, specs under `e2e/<domain>/*.spec.ts` |
| **Quick run command** | `pnpm --filter api test:quick` (unit project only — no DB) |
| **Full suite command** | `pnpm test` (all workspaces) + `pnpm --filter api test:integration` + `cd apps/client && pnpm test` + `pnpm test:e2e:web` |
| **Estimated runtime** | Quick: <5s (pure date module, no DB). Full: several minutes (integration project is `fileParallelism: false`). |

---

## Sampling Rate

- **After every task commit:** `pnpm --filter api test:quick` + `pnpm --filter api typecheck` + `cd apps/client && pnpm typecheck`
- **After every plan wave:** `pnpm --filter api test:integration` + `cd apps/client && pnpm test` + `pnpm openapi:check`
- **Before `/gsd-verify-work`:** `pnpm test` + `pnpm test:integration` + `pnpm test:e2e:web` + `pnpm openapi:check` all green
- **Max feedback latency:** ~5s (unit tier — the pure `recurrence-date.ts` module is deliberately zero-infrastructure so date-math regressions surface immediately)

---

## Per-Task Verification Map

*Not yet populated — Task IDs are assigned by `/gsd-plan-phase 7` when PLAN.md is created. The planner must map each task to a row in this table using the Phase Requirements → Test Map below as the source of truth (see `07-RESEARCH.md` § Validation Architecture).*

| Requirement | Behavior | Test Type | Automated Command | File (Wave 0) |
|-------------|----------|-----------|--------------------|---------------|
| RECR-01 | Month-end clamping across leap/non-leap years (D-09) | unit | `pnpm --filter api test:quick` | `apps/api/src/modules/recurrence/recurrence-date.test.ts` |
| RECR-01 | Local wall-time → UTC across DST spring-forward/fall-back (D-10) | unit | `pnpm --filter api test:quick` | same file |
| RECR-01 | Weekly-with-selected-weekdays walk; `interval` respected | unit | `pnpm --filter api test:quick` | same file |
| RECR-01 | `endsOn` XOR `count` termination (D-06) | unit | `pnpm --filter api test:quick` | same file |
| RECR-01 | `POST /households/:id/events` with `recurrence` creates rule + N instances | integration | `pnpm --filter api test:integration` | `apps/api/test/recurrence/recurrence-rules.int.test.ts` |
| RECR-01 | `POST .../tasks` with `recurrence` copies `TaskAssignee`/`TaskLabel` per instance | integration | `pnpm --filter api test:integration` | same file |
| RECR-01 | D-06 mutual exclusion rejected with `VALIDATION_FAILED` | integration | `pnpm --filter api test:integration` | same file |
| RECR-01 | Non-member gets `404 HOUSEHOLD_NOT_FOUND` on every recurrence route (SAFE-01) | integration | `pnpm --filter api test:integration` | same file |
| RECR-01 | Materializer run twice creates zero extra rows (D-03 idempotency) | integration | `pnpm --filter api test:integration` | `apps/api/test/recurrence/materializer.int.test.ts` |
| RECR-01 | Watermark advances; second run within horizon is a no-op | integration | `pnpm --filter api test:integration` | same file |
| RECR-02 | "仅此一次" edit doesn't affect siblings; edited date not regenerated | integration | `pnpm --filter api test:integration` | `recurrence-rules.int.test.ts` |
| RECR-02 | "此后所有" split: old `endsOn`=date−1, new rule created, future replaced, past untouched | integration | `pnpm --filter api test:integration` | same file |
| RECR-02 | Split is atomic — forced mid-split failure leaves old rule unmodified (D-08) | integration | `pnpm --filter api test:integration` | same file |
| RECR-02 | Cancelled task excluded from Today's 今日待办 partition | client unit | `cd apps/client && pnpm test` | `apps/client/src/features/tasks/__tests__/task-status-test.tsx` |
| RECR-01 | Recurrence picker: weekday toggle, freq switch, end-condition switch, a11y roles | client unit | `cd apps/client && pnpm test` | `apps/client/src/features/recurrence/__tests__/recurrence-picker-test.tsx` |
| RECR-02 | Scope dialog offers exactly "仅此一次"/"此后所有", dispatches right call | client unit | `cd apps/client && pnpm test` | `.../__tests__/series-scope-dialog-test.tsx` |
| RECR-01/02 | E2E web: create recurring event, verify instances on calendar, split series | e2e | `pnpm test:e2e:web` | `e2e/events/recurrence.spec.ts` |
| — (regression) | OpenAPI hand-maintained client (`packages/api-client`) matches committed tree after recurrence fields added | contract | `pnpm openapi:check` | n/a — existing check |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky — all rows ⬜ pending until PLAN.md tasks execute.*

---

## Wave 0 Requirements

- [ ] `apps/api/src/modules/recurrence/recurrence-date.test.ts` — pure date-math unit tests (D-05, D-06, D-09, D-10); **highest priority, zero infrastructure cost**
- [ ] `apps/api/test/recurrence/recurrence-rules.int.test.ts` — rule CRUD + instance generation + split-series (RECR-01, RECR-02)
- [ ] `apps/api/test/recurrence/materializer.int.test.ts` — idempotency + watermark advancement (D-03)
- [ ] `apps/client/src/features/recurrence/__tests__/recurrence-picker-test.tsx` — RECR-01 UI
- [ ] `apps/client/src/features/recurrence/__tests__/series-scope-dialog-test.tsx` — RECR-02 UI
- [ ] `apps/client/src/features/tasks/__tests__/task-status-test.tsx` — `cancelled` status fan-out (today-view exclusion, status-cycle guard)
- [ ] `e2e/events/recurrence.spec.ts` — RECR-01/02 end-to-end web journey
- Framework install: **none needed** — Vitest, Jest, Playwright already installed/configured
- Fixture helpers (`insertActor`, `createHousehold`, `addMemberViaDb`, `taskApi`): **copy into new test files**, following the existing per-file duplication convention (`apps/api/test/tasks/tasks.int.test.ts:33-99`) — do not refactor to shared fixtures in this phase, that would inflate blast radius
- Optional: extend `scripts/check-required-tests.ps1`'s `$requiredTests` array with the new Wave 0 paths above

---

## Manual-Only Verifications

*None identified — all phase behaviors (including D-09 month-end clamping and D-10 DST handling) have automated coverage via the unit date-math suite. Android real-device acceptance for the recurrence UI follows the same pattern as Phases 2-4 and is tracked as a phase-gate checkpoint, not a manual-only *test*.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (7 files above)
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s (quick tier)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
