---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 01
current_phase_name: safe-account-entry
status: executing
stopped_at: Completed 01-08-PLAN.md
last_updated: "2026-08-01T03:46:35.378Z"
last_activity: 2026-08-01
last_activity_desc: Phase 01 execution started
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 27
  completed_plans: 9
  percent: 33
---

# Project State

## Current Position

**Phase:** 01 (safe-account-entry) — EXECUTING
**Plan:** 10 of 27
**Status:** Ready to execute
**Last activity:** 2026-08-01 — Phase 01 execution started

## Project Reference

See `.planning/PROJECT.md` for the project definition and `.planning/ROADMAP.md` for delivery phases.

**Core value:** 家庭成员可以在手机上低摩擦地共享安排与待办，并始终看到一致、可信的家庭协作状态。

## Recent Decisions

- Mobile app is the primary product; Web is an auxiliary entry point.
- Use React Native with Expo, Expo Router and TypeScript across clients.
- Use a TypeScript NestJS modular monolith with Fastify, REST/OpenAPI and PostgreSQL.
- Use stable Prisma ORM releases and a pnpm workspace monorepo.
- v1 authentication is email/password only; third-party login is deferred.
- Anyone can register and create a household; one user can belong to multiple households.
- Use short-lived access tokens and rotating refresh tokens with platform-appropriate secure storage.
- Build one shared branded design system across Android, iOS and Web.
- Organize delivery as six vertical MVP phases.

## Open Concerns

- iOS simulator and final App Store validation require access to macOS, although EAS cloud builds can be initiated from Windows.
- Transactional email, PostgreSQL hosting, object hosting and observability providers remain deployment-time choices.

## Blockers

None.

## Next Action

Approve this roadmap, then discuss and plan Phase 1.

## Session

**Last session:** 2026-08-01T03:46:35.372Z
**Stopped at:** Completed 01-08-PLAN.md
**Resume file:** None

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 01 P01 | 2min | 1 tasks | 1 files |
| Phase 01 P02 | 40min | 2 tasks | 9 files |
| Phase 01 P03 | 8min | 1 tasks | 9 files |
| Phase 01 P04 | 7min | 1 tasks | 6 files |
| Phase 01 P09 | 4min | 2 tasks | 6 files |
| Phase 01 P05 | 10min | 1 tasks | 8 files |
| Phase 01 P06 | 15min | 1 tasks | 4 files |
| Phase 01 P07 | 16min | 1 tasks | 6 files |
| Phase 01 P08 | 8min | 1 tasks | 3 files |

## Decisions

- [Phase 01]: Use expo@57.0.9 with react@19.2.3 and react-native@0.86.2. — Expo SDK 57 official compatibility and template override the research draft react@19.2.8 pin.
- [Phase 01]: Install only the audited official package pins in Plan 01-02; no substitutions or preview packages. — The blocking supply-chain review approved the complete set before any package-manager mutation.
- [Phase 01]: Pin pnpm at 10.34.5 and TypeScript at stable 5.x version 5.9.3. — TypeScript 7 is outside the project-locked stable 5.x stack.
- [Phase 01]: Use isolated local test ports 55432, 11025, and 18025. — Avoid collisions with developer PostgreSQL and mail services while keeping tests deterministic.
- [Phase 01]: Keep production origins and SMTP provider credentials deferred to Phase 6 release gates. — Phase 1 needs explicit local origins without prematurely choosing deployment providers.
- [Phase 01]: Split API tests into named unit and integration Vitest projects. — Quick tests avoid PostgreSQL while integration tests remain serial and migrated.
- [Phase 01]: Guard destructive database resets with loopback and test-name checks. — Preserves migration history and prevents accidental non-test database truncation.
- [Phase 01]: Require discovery and an exact caller marker for valid RED evidence. — Arbitrary nonzero exits cannot be misreported as expected missing behavior.
- [Phase 01]: Keep the approved Expo 57.0.9, React 19.2.3, and React Native 0.86.2 trio in the client workspace. — Preserves the human-approved compatibility and supply-chain boundary.
- [Phase 01]: Bridge the React Native Jest 29 environment to the approved Jest 30 runner in configuration. — Enables executable client tests without substituting approved packages.
- [Phase 01]: Keep production association domains empty until the Phase 6 release gate. — Phase 1 defines a local scheme without claiming unselected public domains.
- [Phase 01]: Keep browser contracts suite-skipped until their owning client routes and forms exist; server-only plans cannot claim UI RED. — Preserves client ownership and prevents infrastructure failures from being accepted as behavior RED.
- [Phase 01]: Skipped browser contracts use real system assertions rather than fake passes. — Mailpit, HttpOnly cookies, Web storage, multiple browser contexts, axe, focus, zoom, and media preferences remain executable when each owner activates its suite.
- [Phase 01]: Treat Plan 01-05 as discovery evidence only; no behavioral RED is claimed before an owning plan activates its exact marker. — The 65 Wave 0 contracts are intentionally skipped and production behavior does not exist yet.
- [Phase 01]: Allow API contract discovery without Docker only while the Prisma schema is absent. — Once Plan 01-10 creates the schema, the existing Docker, migration, and reset path remains mandatory.
- [Phase 01]: Pin SecLists 2026.1 commit 190c6f7 and derive the runtime denylist deterministically from the 12-128 code-point policy. — Immutable source identity, source/output checksums, and one runtime file prevent policy and fixture drift.
- [Phase 01]: Pin the ASVS 5.0.0 CSV checksum and normalized applicable-requirement hash for an offline tamper-evident evidence map. — CI can detect identifier or official-text drift without depending on network availability.
- [Phase 01]: Keep Plan 01-07 as discovery-only Wave 0 scaffolding. — Later owners activate unique missing-behavior markers against real production boundaries; this plan does not claim behavioral RED or GREEN.
- [Phase 01]: Name D-06 as an explicit cross-suite proof-to-session pipeline. — Registration writes the native proof, verification reads and clears it, accepts the issued session, enters authenticated state, and routes no-household accounts to the Phase 2 handoff while Web remains HttpOnly-cookie-only.
- [Phase 01]: Treat Plan 01-08 as discovery-only design-system scaffolding; Plan 01-14 owns truthful RED activation and production GREEN. — Preserves Wave 0 discovery without prematurely implementing behavior.
- [Phase 01]: Keep feature files outside every raw-style allowlist. — The typed Restyle theme and owned primitives remain the sole visual-style boundary.
- [Phase 01]: Measure contrast and geometry through WCAG ratios, 48x48 minimum touch targets, and 52px primary controls. — Turns D-15 and D-17 into objective accessibility gates.
