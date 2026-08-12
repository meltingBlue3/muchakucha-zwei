---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: blocked_on_human_checkpoint
stopped_at: Completed 07-02-PLAN.md
last_updated: "2026-08-12T02:26:54.692Z"
last_activity: 2026-08-06
last_activity_desc: most recent commit (`f2969a4`, EAS build config); session history before this reconciliation pass stopped tracking at 2026-08-04
progress:
  total_phases: 7
  completed_phases: 1
  total_plans: 48
  completed_plans: 41
  percent: 14
current_phase: 02
current_phase_name: household-member-collaboration
---

# Project State

## Current Position

**Phase 07 progress:** Plans 07-01 and 07-02 complete (2/8); recurring task storage, the four-frequency calendar walk, and the rolling materialization worker are implemented.

**Phase (GSD-tracked):** 02 (household-member-collaboration) — 12/13 plans complete, blocked on `02-13` (Android acceptance)
**Reconciled 2026-08-11:** Direct source verification shows implementation has actually progressed through Phases 3, 4, and most of 5 — see `.planning/ROADMAP.md` for the full per-phase breakdown. `gsd-tools` still reports current_phase=02 because no `.planning/phases/03-*` through `05-*` PLAN.md/SUMMARY.md artifacts exist on disk (that work was done directly on `main`, outside `/gsd-discuss-phase` → `/gsd-plan-phase` → `/gsd-execute-phase`). This field is left at 02 deliberately — it is the earliest phase with real unresolved GSD-tracked work (a pending human checkpoint), consistent with `/gsd-progress`'s own Route 0 resume-incomplete-phase logic.
**Status:** Not executing — waiting on human action (real Android device), not on planning/coding
**Last activity:** 2026-08-06 — most recent commit (`f2969a4`, EAS build config); session history before this reconciliation pass stopped tracking at 2026-08-04

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

## Roadmap Evolution

- Phase 7 added: 周期性重复事件与任务 (recurring events & tasks — daily/weekly-on-selected-weekdays/monthly/yearly repetition for events and tasks). Extends the original six-phase plan. Depends on Phase 3 (calendar) and Phase 4 (tasks), not Phase 6 — runs in parallel with Phase 6 release-readiness work and the pending Android acceptance backlog, not blocked by them. Not yet planned (`/gsd-plan-phase 7` pending); directory `.planning/phases/07-recurring-events-tasks/`.

## Open Concerns

- iOS simulator and final App Store validation require access to macOS, although EAS cloud builds can be initiated from Windows.
- Transactional email, PostgreSQL hosting, object hosting and observability providers remain deployment-time choices.
- **Three phases are parked on the same real-device Android acceptance step**: `02-13`, `03-04`, `04-04`. All automated gates for Phases 2-4 are green; only the human-in-the-loop device session is outstanding. Worth batching into one acceptance pass.
- **Phase 3 (calendar) is missing an accessibility E2E audit** — `e2e/tasks/accessibility.spec.ts` exists for Phase 4 but there's no equivalent for events/calendar screens.
- **Phase 5 (notes & labels) was implemented directly on `main`, bypassing the GSD plan/execute flow.** Code is functionally complete (API + client UI for notes CRUD, label CRUD with rename/color, tag/untag on events and tasks) but: (a) has zero automated test coverage — no integration tests, no E2E tests, (b) is missing the "filter events/tasks by label" capability required by the phase's success criteria, and (c) has no accessibility audit or Android acceptance. No `.planning/phases/05-*` PLAN.md/SUMMARY.md artifacts exist to formally close it out.
- Working tree has uncommitted changes as of 2026-08-11 (`apps/client/app.json`, `eas.json`, `package.json`, `pnpm-lock.yaml`) adding `expo-build-properties` (Android cleartext traffic) and pointing the EAS preview API origin at a public IP — appears to be in-progress prep for a remote device build/test, not yet committed.

## Blockers

None hard-blocking — all current blockers are the pending human Android acceptance checkpoints noted above (require a real device, not further coding).

## Next Action

Pick one:

1. **Close out the Android-acceptance backlog** — run one real-device session covering `02-13`, `03-04`, and `04-04` together (`/gsd-execute-phase 02` picks up `02-13` first; `03-04`/`04-04` have no formal PLAN.md to execute against since those phase directories are empty — see below).
2. **Formally close Phase 5** — since no GSD artifacts exist for it, treat it as needing retroactive planning: write CONTEXT/PLAN/SUMMARY docs for the already-implemented 05-01/05-02 work, then plan and execute 05-03 (test suite + label-filter feature + accessibility + Android acceptance). `/gsd-plan-phase 5` or `/gsd-add-tests` are candidate entry points.
3. Note: Phase 3 and 4 also lack `.planning/phases/03-*`/`04-*` PLAN.md/SUMMARY.md files even though their code is verified complete via direct source inspection (see ROADMAP.md notes, 2026-08-11) — only Phase 3 had a stray `.continue-here.md` handoff. If strict GSD tracking parity matters going forward, those phases may also need retroactive artifacts.

## Session

**Last session:** 2026-08-12T02:26:54.685Z
**Stopped at:** Completed 07-02-PLAN.md
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
| Phase 01 P10 | 15min | 2 tasks | 11 files |
| Phase 01 P14 | 17min | 2 tasks | 10 files |
| Phase 01 P11 | 10min | 2 tasks | 11 files |
| Phase 01 P12 | 5min | 2 tasks | 8 files |
| Phase 01 P13 | 12min | 2 tasks | 18 files |
| Phase 01 P15 | 26min | 2 tasks | 18 files |
| Phase 01 P16 | 10min | 2 tasks | 10 files |
| Phase 01 P17 | 18min | 2 tasks | 8 files |
| Phase 01 P18 | 12min | 2 tasks | 14 files |
| Phase 01 P19 | 8min | 2 tasks | 11 files |
| Phase 01 P20 | 10min | 2 tasks | 7 files |
| Phase 01 P22 | 8min | 2 tasks | 9 files |
| Phase 01 P21 | 15min | 2 tasks | 12 files |
| Phase 01 P24 | 10min | 2 tasks | 8 files |
| Phase 01 P23 | 20min | 2 tasks | 7 files |
| Phase 01 P25 | 16min | 2 tasks | 8 files |
| Phase 01 P26 | 11min | 2 tasks | 16 files |
| Phase 01 P27 | 6h 20m | 1 human checkpoint | Android acceptance and 3 fixes |
| Phase 07 P01 | 20min | 2 tasks | 12 files |
| Phase 07 P02 | 12min | 2 tasks | 7 files |

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
- [Phase 01]: Enforce canonical email in PostgreSQL as lower(normalize(btrim(email), NFC)) while preserving the submitted email separately. — Identity equivalence and uniqueness are database-enforced without losing the original delivery/display value.
- [Phase 01]: Persist only unique lowercase SHA-256 token hashes and bind pending proof validity to active verification state with database CHECK constraints. — Database dumps cannot reveal opaque credentials and invalid terminal-state combinations are rejected.
- [Phase 01]: Reuse an integration database only after it proves PostgreSQL major 18; otherwise Compose owns deterministic startup and migration. — Fast local reruns remain truthful to the locked database major and never silently fall back to PostgreSQL 15/17.
- [Phase 01]: Keep all visual values in the Restyle theme while owned primitives expose the D-14 through D-17 component contract. — Preserves one typed cross-platform visual boundary.
- [Phase 01]: Use explicit Lucide icon subpath imports with a test-only CommonJS resolver. — Keeps Metro tree-shakeable and Jest executable.
- [Phase 01]: Encode reduced-motion and forced-colors behavior as deterministic primitive helpers while rendering no distracting large illustration. — Makes preference behavior reusable and testable by downstream screens.
- [Phase 01]: Expose raw OpenAPI JSON at /api/v1/openapi.json without adding the optional unapproved static Swagger UI dependency. — Downstream generation needs the contract while @fastify/static was outside the approved package boundary.
- [Phase 01]: Bind AuthModule to a provider-neutral MailPort and confine verification/reset links to SMTP delivery payloads. — Keeps provider details and secret-bearing links outside auth use cases and logs.
- [Phase 01]: Keep Web pending-proof handling capability-only with credentialed requests and no JavaScript secret API. — The API must retain exclusive HttpOnly cookie ownership.
- [Phase 01]: Persist native refresh material before publishing memory-only access and clear both layers on acceptance failure. — Prevents partial authenticated state when SecureStore fails.
- [Phase 01]: Distinguish offline restoration from expired, revoked, or replayed credentials. — Network failures retain credentials while explicit authentication failures require clearing and reauthentication.
- [Phase 01]: Issue a fresh opaque pending proof on every generic registration response, but persist it only for a newly created canonical identity. — Preserves generic response shape without linking duplicate attempts to an account.
- [Phase 01]: Require both platform web and an exact configured Origin for HttpOnly pending-proof cookie delivery; native requests must not carry a browser Origin. — Prevents caller metadata from crossing credential transport boundaries.
- [Phase 01]: Start verification mail delivery only after commit and keep provider latency outside the generic 202 response path. — Preserves committed state ordering and reduces identity-enumeration timing differences.
- [Phase 01]: Generate the typed API client from the live Nest OpenAPI document and enforce drift with a cross-platform Node gate. — Keeps clients independent from Prisma and makes the canonical drift command executable on supported hosts.
- [Phase 01]: Match the client Web renderer to exact react-dom 19.2.3 and react-native-web 0.21.2. — Preserves the approved Expo SDK 57 React 19.2.3 compatibility line.
- [Phase 01]: Use extensionless generated-client imports with TypeScript Bundler resolution. — Lets Expo Metro and strict typechecking consume one deterministic generated package.
- [Phase 01]: Write native registration proof before pending navigation while Web remains HttpOnly-cookie-only. — Prevents partial native continuation state and keeps Web secrets outside JavaScript.
- [Phase 01]: Transfer the pending-proof hash to the resend successor transactionally. — Preserves D-06 same-device continuation without exposing or duplicating plaintext proof.
- [Phase 01]: Select verification secret transport from accepted credential source. — Web remains API-owned HttpOnly cookie-only while native receives SecureStore material.
- [Phase 01]: Expose resend eligibility through the stable retryAfterSeconds error field. — The client countdown mirrors server authority while Nest throttling remains independent.
- [Phase 01]: Sanitize verification links before completion, clear native proof before issued-session acceptance, and derive deliverable mail links from an exact EMAIL_LINK_ORIGIN. — This preserves token-free browser history, fail-closed SecureStore ordering, and the API-owned HttpOnly versus native SecureStore credential boundary across the real SMTP journey.
- [Phase 01]: Use approved @nestjs/jwt HS256 with a mandatory 32-byte production secret and 15-minute sub/sid-only access tokens. — Keeps access credentials short-lived, minimal, and fail-closed with the approved monolith signing dependency.
- [Phase 01]: Return refresh replay as a serializable transaction outcome before raising the API error. — Throwing inside the transaction would roll back the targeted session compromise and defeat durable replay handling.
- [Phase 01]: Select refresh response shape from the accepted cookie or body credential source. — Rejecting ambiguous and cross-platform transport prevents browser JavaScript from requesting a readable refresh secret.
- [Phase 01]: Nest UsersModule owns the registered AuthModule boundary for exact AccessTokenGuard reuse. — Avoids parallel JWT configuration while keeping users/me HTTP-reachable through AppModule.
- [Phase 01]: Keep hasHousehold false as the explicit Phase 1 account handoff signal. — Household membership and Today lookup belong to Phase 2 and must not be claimed by users/me.
- [Phase 01]: Accept and persist rotated platform credentials before users/me. — Availability failures retain the valid successor instead of stranding a committed server rotation.
- [Phase 01]: Map explicit refresh rejection to expired, revoked, or replayed reauthentication while treating network, 408, 429, and 5xx as offline retention. — D-11 credential clearing remains distinct from D-12 availability recovery.
- [Phase 01]: Use process single-flight on native and Web Lock with an in-tab fallback on Web. — Concurrent refresh calls cannot race one rotating generation.
- [Phase 01]: Use 30-minute hash-only reset credentials with predecessor invalidation and post-commit mail delivery. — Keeps recovery credentials out of database dumps and prevents stale links from remaining active.
- [Phase 01]: Complete reset in one serializable consume-password-update-global-revoke transaction and issue no session. — Makes token use atomic, reuses the resolved password policy, and requires normal login after recovery.
- [Phase 01]: Share one module-scoped session transport and state store between root bootstrap and login so authenticated state is observable before protected navigation. — Prevents route-local authentication state from diverging from the root protection boundary.
- [Phase 01]: Bypass restart restoration only for public registration and token-sanitizing continuation routes; protected and root entry remain splash-owned until restoration resolves. — Preserves deep-link and registration ownership without flashing protected or login content.
- [Phase 01]: Route every Phase 1 authenticated profile to the no-household handoff and preserve only allowlisted internal intended routes without claiming Today or household behavior. — Keeps D-03 inside the Phase 1 boundary and blocks external redirect injection.
- [Phase 01]: Derive logout identity exclusively from a verified access JWT sub/sid pair and expose no request-body session or user target. — Prevents caller-selected cross-device or cross-user revocation.
- [Phase 01]: Allow a valid, unexpired, known but already revoked sid only on the logout route so repeated logout remains 204 while every other protected route still requires an active session. — Preserves required endpoint idempotency without weakening normal authorization.
- [Phase 01]: Sanitize the token-bearing browser location synchronously and keep replacing it until the reset landing unmounts. — Expo Router can restore search parameters after its first render.
- [Phase 01]: Keep password-reset completion entirely outside the session runtime. — Success must route only to normal login after the server-owned global revoke transaction.
- [Phase 01]: Preserve the server's generic invalid-or-expired credential boundary while exposing accessible expired, used, and invalid recovery panels as client states. — This keeps the server security contract while completing client recovery semantics.
- [Phase 01]: Clear platform-local and in-memory session state only after the generated logout operation returns a server outcome; availability failures retain the credential for safe retry.
- [Phase 01]: Preserve an authenticated /profile target during restoration instead of replacing every authenticated route with the Phase 1 household handoff.
- [Phase 01]: Use one deterministic SMTP/HTTP mailbox process for the complete Playwright run when the pinned Mailpit image is unavailable.
- [Phase 01]: Bypass throttling only when NODE_ENV=test and Playwright explicitly sets E2E_DISABLE_RATE_LIMITS=true; production and integration security tests retain real limits.
- [Phase 01]: Use a disposable tmpfs-backed PostgreSQL 18 fallback for verification without changing the committed Compose image pin.
- [Phase 07]: Selected option-a: store startTimeLocal and durationMinutes on RecurrenceRule so scheduling data survives occurrence deletion.
- [Phase 07]: Weekly recurrence uses Sunday=0 through Saturday=6, matching the client calendar header.
- [Phase 07]: Seed recurring tasks on the first calendar-valid occurrence when startsOn is not selected.
