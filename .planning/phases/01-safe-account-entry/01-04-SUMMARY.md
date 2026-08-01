---
phase: 01-safe-account-entry
plan: 04
subsystem: testing
tags: [expo, jest-expo, react-native-testing-library, secure-store, platform-mocks]

requires:
  - phase: 01-safe-account-entry/01-02
    provides: Approved Expo dependency pins, frozen pnpm workspace, and strict shared TypeScript baseline
provides:
  - SDK 57-aligned Expo Router client workspace with one-shot Jest Expo discovery
  - Deterministic SecureStore, network, reduced-motion, and forced-colors test boundaries
  - Local custom-scheme linking with production association domains explicitly deferred
affects: [01-07-client-contract-tests, 01-08-ui-contract-tests, 01-16-client-session, phase-01-final-gates]

tech-stack:
  added: []
  patterns:
    - Client tests execute once with Jest Expo and discover the phase contract naming convention
    - Web tests fail closed if application code attempts to use native SecureStore

key-files:
  created:
    - apps/client/package.json
    - apps/client/app.json
    - apps/client/tsconfig.json
    - apps/client/jest.config.js
    - apps/client/jest.setup.ts
  modified:
    - pnpm-lock.yaml

key-decisions:
  - "Keep the approved expo@57.0.9, react@19.2.3, and react-native@0.86.2 compatibility trio in the client workspace."
  - "Patch the React Native Jest 29 mocker boundary inside Jest configuration so the approved Jest 30 runner can execute without replacing approved packages."
  - "Use only the local muchakucha-zwei scheme in Phase 1 and leave iOS production association domains empty until the Phase 6 release gate."

patterns-established:
  - "Platform mocks: native secrets use an isolated in-memory SecureStore mock that rejects Web access; unmocked network requests fail deterministically."
  - "Preference mocks: reduced motion and forced colors start from explicit false defaults and reset before every test."

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, SAFE-03]

coverage:
  - id: D1
    description: "Expo client configuration, strict TypeScript, and Jest Expo one-shot discovery load independently of API infrastructure."
    requirement: SAFE-03
    verification:
      - kind: other
        ref: "pnpm --filter client exec jest --version && pnpm --filter client exec tsc --noEmit && pnpm --filter client exec jest --listTests --runInBand"
        status: pass
    human_judgment: false
  - id: D2
    description: "SecureStore, network, reduced-motion, and forced-colors mocks enforce deterministic platform boundaries."
    requirement: SAFE-03
    verification:
      - kind: unit
        ref: "pnpm --filter client exec jest --runInBand src/__tests__/setup-smoke-test.ts (ephemeral setup smoke, removed after pass)"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-08-01
status: complete
---

# Phase 01 Plan 04: Expo Client Test Infrastructure Summary

**Expo SDK 57 client testing now runs through a one-shot Jest Expo configuration with strict TypeScript and fail-closed native/Web platform mocks.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-08-01T02:51:10Z
- **Completed:** 2026-08-01T02:58:39Z
- **Tasks:** 1
- **Files modified:** 6

## Accomplishments

- Created the `client` workspace with the approved Expo 57.0.9, React 19.2.3, and React Native 0.86.2 trio, Expo Router entry point, and strict shared TypeScript rules.
- Added one-shot Jest Expo discovery for the phase's `*-test.ts(x)` contract paths and verified the setup with a focused executable smoke test.
- Added deterministic SecureStore, network, reduced-motion, and forced-colors mocks that reject Web SecureStore use and prevent accidental real network traffic.
- Defined a local Expo custom scheme and empty iOS association list without claiming production domains.

## Task Commits

Each task was committed atomically:

1. **Task 1: Configure Expo component and adapter testing** - `4e474c1` (chore)

## Files Created/Modified

- `apps/client/package.json` - SDK-aligned client scripts and exact approved dependency ownership.
- `apps/client/app.json` - Expo Router, SecureStore, local scheme, platform identifiers, and deferred association configuration.
- `apps/client/tsconfig.json` - Strict JSX/Bundler TypeScript settings inherited from the workspace baseline.
- `apps/client/jest.config.js` - Jest Expo preset, one-shot contract discovery, setup loading, and Jest 30 compatibility boundary.
- `apps/client/jest.setup.ts` - Fail-closed SecureStore/network mocks plus deterministic accessibility preferences.
- `pnpm-lock.yaml` - Offline-generated client workspace importer using the existing approved dependency graph.

## Decisions Made

- Retained every approved package identity and exact pin; no dependency substitution was used to resolve the Jest environment seam.
- Kept production deep-link association domains release-gated while defining a stable local scheme for development and tests.
- Made unmocked network calls reject by default so component tests cannot silently contact external services.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added the client importer to the frozen lockfile**
- **Found during:** Task 1 (Configure Expo component and adapter testing)
- **Issue:** A new `apps/client/package.json` without a lockfile importer would make the next frozen workspace install fail.
- **Fix:** Regenerated lockfile metadata offline, reusing only the previously approved and installed package graph.
- **Files modified:** `pnpm-lock.yaml`
- **Verification:** `pnpm install --frozen-lockfile --offline` passes without downloads or substitutions.
- **Committed in:** `4e474c1`

**2. [Rule 3 - Blocking] Bridged the React Native Jest 29 environment to the approved Jest 30 runner**
- **Found during:** Task 1 executable setup smoke verification
- **Issue:** React Native 0.86.2's test environment instantiates Jest 29's `ModuleMocker`, while Jest 30.4.2 calls the newer scoped mock-cleanup hook before running a suite.
- **Fix:** Added the missing scoped cleanup behavior in `jest.config.js`, using property descriptors so Expo lazy global getters are never evaluated during cleanup.
- **Files modified:** `apps/client/jest.config.js`
- **Verification:** The focused setup smoke suite passed with SecureStore, network, reduced-motion, and forced-colors assertions, followed by a successful strict TypeScript check.
- **Committed in:** `4e474c1`

---

**Total deviations:** 2 auto-fixed (2 blocking issues).
**Impact on plan:** Both fixes preserve the approved dependency set and make the client runner reproducible; no feature scope was added.

## Issues Encountered

- The Jest CLI banner reports `30.4.1` because the approved `jest@30.4.2` package delegates version reporting to an internal 30.4.1 package. The manifest and frozen lockfile both resolve the approved top-level `jest@30.4.2`, and executable test verification passes.

## User Setup Required

None - no external service configuration or production domains are required for this test infrastructure.

## Known Stubs

- `apps/client/app.json` intentionally leaves `ios.associatedDomains` empty. Phase 6 owns real HTTPS domains and the associated Android/iOS release verification; the local scheme is complete for Phase 1.

## Next Phase Readiness

- Plans 01-07 and 01-08 can add the exact client and design contract test paths; Jest will discover their `*-test.ts(x)` names without watch mode.
- Native session tests can use the isolated SecureStore mock, while Web tests fail immediately if they cross the HttpOnly-cookie boundary.
- No production association, secret-storage, or network behavior is falsely represented by the test environment.

## Self-Check: PASSED

- All five planned client files and the frozen lockfile importer exist.
- Task commit `4e474c1` exists in repository history and contains no deletions.
- Plan verification, Jest discovery, Expo config parsing, strict TypeScript, frozen install, and the executable platform-mock smoke test passed.
- No untracked runtime fixtures or goal-blocking stubs remain.

---
*Phase: 01-safe-account-entry*
*Completed: 2026-08-01*
