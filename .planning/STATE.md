---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 01
current_phase_name: safe-account-entry
status: executing
stopped_at: Completed 01-19-PLAN.md
last_updated: "2026-08-01T13:23:42.859Z"
last_activity: 2026-08-01
last_activity_desc: Phase 01 execution started
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 27
  completed_plans: 19
  percent: 70
---

# Project State

## Current Position

**Phase:** 01 (safe-account-entry) — EXECUTING
**Plan:** 20 of 27
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

**Last session:** 2026-08-01T13:23:42.853Z
**Stopped at:** Completed 01-19-PLAN.md
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
