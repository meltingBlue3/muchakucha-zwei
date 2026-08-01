---
phase: 01-safe-account-entry
plan: 06
subsystem: security
tags: [owasp-asvs, password-policy, seclists, provenance, vitest]

requires:
  - phase: 01-safe-account-entry/01-03
    provides: Discovery-first RED evidence tooling and focused API security test execution
provides:
  - Licensed deterministic top-3000 runtime common-password denylist with immutable provenance
  - Stable OWASP ASVS 5.0.0 L1 control-to-test map for 32 applicable controls
  - Executable offline audit for denylist integrity, official ASVS text, and named evidence paths
affects: [01-13-registration, 01-19-password-reset, phase-01-security-gates]

tech-stack:
  added: []
  patterns:
    - Security policy data is pinned by upstream commit and checksum, deterministically derived, and consumed from one runtime file
    - ASVS evidence uses stable identifiers, official-text hashing, and exact named test-path checks

key-files:
  created:
    - apps/api/test/security/asvs-v5-l1.test.ts
    - apps/api/src/modules/auth/data/common-passwords-top-3000.txt
    - apps/api/src/modules/auth/data/common-passwords-SOURCE.md
    - docs/security/asvs-v5.0.0-l1.md
  modified: []

key-decisions:
  - "Pin SecLists release 2026.1 at commit 190c6f7 and derive the runtime denylist by source order, the 12-128 code-point policy, exact deduplication, and first-3000 selection."
  - "Make the ASVS audit offline and tamper-evident by pinning the stable v5.0.0 CSV checksum plus a normalized hash of all 32 applicable official requirement texts."

patterns-established:
  - "Password denylist provenance: verify upstream bytes before deriving, record both source and output SHA-256, and never duplicate the runtime fixture in tests."
  - "ASVS evidence row: stable ID, L1 applicability, exact official text, existing test path, and one exact assertion name."

requirements-completed: [AUTH-01, AUTH-04, SAFE-03, SAFE-04]

coverage:
  - id: D1
    description: "A licensed pinned SecLists source deterministically produces the exact 3000-entry runtime common-password denylist, with source and output checksums recorded."
    requirement: AUTH-01
    verification:
      - kind: unit
        ref: "apps/api/test/security/asvs-v5-l1.test.ts#runtime common-password data is the exact licensed deterministic top-3000 derivation"
        status: pass
      - kind: other
        ref: "independent pinned-source re-derivation compared byte-for-byte with the committed runtime file"
        status: pass
    human_judgment: false
  - id: D2
    description: "All 32 applicable ASVS 5.0.0 L1 controls have recognized stable IDs, exact official text, and an existing path containing one named assertion."
    requirement: SAFE-04
    verification:
      - kind: unit
        ref: "apps/api/test/security/asvs-v5-l1.test.ts#ASVS map contains every recognized applicable control exactly once with official text"
        status: pass
      - kind: unit
        ref: "apps/api/test/security/asvs-v5-l1.test.ts#every ASVS control names one assertion in an existing test path"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-08-01
status: complete
---

# Phase 01 Plan 06: Password Policy and ASVS Security Contracts Summary

**A checksum-pinned MIT-licensed top-3000 password denylist and a 32-control ASVS 5.0.0 L1 map are now enforced by one focused offline security audit.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-08-01T03:19:00Z
- **Completed:** 2026-08-01T03:34:04Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments

- Derived exactly 3000 unique 12-128-code-point passwords from the pinned SecLists 2026.1 release and committed the only runtime/test asset with immutable MIT-license provenance.
- Recorded all 32 Phase 1-applicable ASVS 5.0.0 L1 controls with exact official requirement text, stable identifiers, applicability, and named evidence paths.
- Added an executable offline Vitest audit that rejects missing or altered assets, checksum drift, undersized/duplicate password data, ASVS ID/text drift, and absent paths or assertions.
- Proved truthful RED through successful discovery and compilation followed by the exact missing-security-contract marker before adding implementation assets.

## Task Commits

The TDD task was committed atomically by gate:

1. **RED: Add failing security evidence audit** - `dfe4b70` (test)
2. **GREEN: Ground password and ASVS security evidence** - `0285d21` (feat)

## Files Created/Modified

- `apps/api/test/security/asvs-v5-l1.test.ts` - Offline denylist/provenance and ASVS completeness/integrity audit.
- `apps/api/src/modules/auth/data/common-passwords-top-3000.txt` - Single 3000-entry runtime common-password policy asset.
- `apps/api/src/modules/auth/data/common-passwords-SOURCE.md` - Pinned source, MIT license, checksums, retrieval date, and deterministic derivation contract.
- `docs/security/asvs-v5.0.0-l1.md` - Authoritative 32-row stable ASVS control-to-test mapping.

## Decisions Made

- Used the SecLists `2026.1` release at immutable commit `190c6f7bd58c847ceadfe57d9853592737f059e8`, rather than a mutable branch URL.
- Preserved exact source entry text and order, filtering only by the project 12-128 Unicode-code-point policy before exact deduplication and first-3000 selection.
- Kept the audit offline: upstream checksums establish provenance while committed files are the only test/runtime inputs, avoiding network-dependent security gates.
- Hashed normalized official ASVS requirement text in validation order so an ID-preserving text substitution also fails the audit.

## TDD Gate Compliance

- **RED:** Vitest discovery listed all four named audit cases and strict TypeScript compiled before `scripts/assert-red.ps1` accepted the exact `IMPLEMENTATION_MISSING_SECURITY_CONTRACTS` behavior failure. Commit: `dfe4b70`.
- **GREEN:** The focused audit passed 4/4 after adding the denylist, provenance, and ASVS map. Commit: `0285d21`.
- **REFACTOR:** No separate refactor was necessary; the minimal GREEN implementation remained clear and all checks passed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected canonical progress percentage after the SDK wrote zero**

- **Found during:** Plan close-out
- **Issue:** `state.update-progress` reported 7/27 plans and 26% but persisted `percent: 0` in STATE frontmatter.
- **Fix:** Applied the handler's own reported canonical percentage after all other SDK-owned position, metric, decision, session, roadmap, and requirement updates completed.
- **Files modified:** `.planning/STATE.md`
- **Verification:** STATE now records 7 completed plans, Plan 8 of 27, and 26% consistently.
- **Committed in:** Plan tracking correction commit after `4fa9814`.

---

**Total deviations:** 1 auto-fixed (1 bug).
**Impact on plan:** Production security assets were unchanged; the fix keeps execution tracking internally consistent.

## Issues Encountered

- The phase-level sampling command `pnpm test:quick` still exits nonzero because the pre-existing API `unit` project has no unit test files. This was already recorded in `deferred-items.md`; Plan 01-06's required security test belongs to the configured integration project, and its focused command passes. No unrelated test-runner scope was changed.

## User Setup Required

None - all security evidence is committed and audited offline.

## Known Stubs

None in the password-policy or ASVS audit assets. Some mapped behavior suites remain intentionally Wave 0-skipped until their owning implementation plans activate them; the mapping records their already-existing exact assertion contracts without claiming behavior is green.

## Next Phase Readiness

- Registration and password-reset plans can consume the single runtime denylist without creating test-only copies.
- Downstream API/client owners have stable ASVS assertion names and paths to activate while preserving the authoritative audit map.
- No external source availability is required for CI verification.

## Self-Check: PASSED

- All four planned artifacts exist on disk.
- RED commit `dfe4b70` and GREEN commit `0285d21` exist in repository history in the required order.
- `pnpm --filter api test --run test/security/asvs-v5-l1.test.ts` passes 4/4 and strict API TypeScript passes.
- An independent fetch and derivation from the pinned source matched the committed 41,645-byte denylist byte-for-byte.
- The committed denylist SHA-256 is `e556819f94c009a90b38eab1051dae4c222ff7148330b4e2b395932465b214ea`; no untracked runtime fixtures or goal-blocking stubs remain.

---
*Phase: 01-safe-account-entry*
*Completed: 2026-08-01*
