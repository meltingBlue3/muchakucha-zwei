---
phase: 02-household-member-collaboration
plan: 06
subsystem: api-client-e2e
tags: [nestjs, prisma, openapi, api-client, react, household-invitation, e2e, tdd]

requires:
  - plan: 02-05
    provides: invitation model with canonical email/SHA-256 hash, send endpoint, privacy-preserving UI, post-commit mail delivery
provides:
  - Public invitation preview endpoint (GET /api/v1/households/invitations/preview) with valid/expired/used/invalid state discrimination
  - Authenticated invitation accept endpoint (POST /api/v1/households/invitations/accept) with D-08 canonical email match and claim-once atomic membership
  - InvitationFlow client component: unauthenticated/matching/mismatch/terminal/accepted state machine per D-07/D-08
  - Token-in-path-segment URL format (/invite/TOKEN) with immediate sanitization and sessionStorage persistence for login round-trip
  - Serialable claim-once transaction with P2034 retry loop, exactly-one membership per concurrent accept
  - Generated typed previewInvitation and acceptInvitation client operations
  - 1 client component test, 1 integration test (9 scenarios), 1 e2e GREEN contract
affects: [member-governance, household-context]

tech-stack:
  added: []
  patterns:
    - "invitationUrl generates path-segment URLs (/invite/TOKEN) instead of query-parameter URLs (/invite?token=) to match the Expo Router [token].tsx dynamic segment"
    - "previewInvitation is public (no auth); acceptInvitation requires AccessTokenGuard with per-method guard configuration"
    - "Claim-once transaction: conditional updateMany + membership create in Serializable isolation; maps P2034 to ConflictException with retry"
    - "D-08 mismatch: server compares actor's canonical email to invitation email_canonical from trusted state, returns 403 with '此邀请发给了另一个邮箱。请切换到受邀账户。'"
    - "Client state machine: loading -> unauthenticated/matching/terminal -> mismatch/accepted; login round-trip via sessionStorage token persistence and session state subscription"
    - "D-07 sanitization: immediate URL replacement from /invite/TOKEN to /invite on web; token persisted to sessionStorage before sanitization for login return"

key-files:
  created:
    - apps/api/test/households/invitations.int.test.ts
    - apps/client/src/features/households/invitation-flow.tsx
    - apps/client/src/features/households/__tests__/invitation-flow-test.tsx
    - apps/client/app/invite/[token].tsx
    - e2e/households/invitation-accept-slice.spec.ts
  modified:
    - apps/api/src/modules/households/households.controller.ts
    - apps/api/src/modules/households/households.service.ts
    - apps/api/src/openapi/generate-openapi.ts
    - packages/api-client/openapi.json
    - packages/api-client/src/generated/models.ts
    - packages/api-client/src/generated/client.ts
    - apps/client/src/features/auth/session-bootstrap.tsx
    - e2e/households/invitation-send-slice.spec.ts

key-decisions:
  - "Invitation URL format changed from /invite?token=XXX to /invite/XXX (path segment) to match Expo Router [token].tsx dynamic segment convention per D-07."
  - "Class-level @UseGuards(AccessTokenGuard) removed from HouseholdsController; guard applied per-method to allow public previewInvitation alongside authenticated endpoints."
  - "Token survives login round-trip via window.sessionStorage; sanitized from browser history immediately but persisted for the InvitationFlow component on return."
  - "Accept returns full GetHouseholdResponseDto after successful membership creation; client routes to the household page on success."
  - "Already-member edge case: if the invitee is already a member, the invitation is consumed silently and the household is returned (idempotent)."
  - "Generic '这个邀请无效或已失效。' for unknown/invalid/expired/invalidated tokens; distinct '已经接受过，不能再次使用。' for consumed invitations."

patterns-established:
  - "Invitation preview-accept: public preview (unauthenticated) -> auth return (login/register) -> explicit accept (authenticated) -> atomic claim+membership -> household entry"
  - "Path-segment token URL: service generates /invite/TOKEN, route extracts via Expo Router [token] dynamic segment, sanitized after capture, persisted in sessionStorage"
  - "Serializable accept transaction: conditional updateMany guard + membership insert; retry on P2034; maps conflict/failure to stable error codes"

requirements-completed: [HHLD-03, HHLD-04, HHLD-05, SAFE-01, SAFE-02]

duration: 30min
completed: 2026-08-03
status: complete

estimate:
  tokens: 18000
  tasks: 2
  commits: 2
actuals:
  tokens: 24000
  tasks: 2
  commits: 2
---

# Phase 02 Plan 06: Invitation Preview and Acceptance Summary

**Sanitized public invitation preview, authenticted email-bound atomic acceptance, and token-persistent login round-trip implementing D-07/D-08 with exactly-once Serializable membership creation, mismatch suppression, and immediate URL sanitization.**

## Performance

- **Duration:** 30 min
- **Started:** 2026-08-03T07:15:00Z
- **Completed:** 2026-08-03T07:45:00Z
- **Tasks:** 2
- **Files modified:** 13 files (5 created, 8 modified)

## Accomplishments

- Created the RED contract: `e2e/households/invitation-accept-slice.spec.ts` with exactly one Playwright test `accepts an invitation explicitly [RED:INVITATION_ACCEPT]`, verifying token sanitation, auth return, invitation fixture preconditions, and failing with `IMPLEMENTATION_MISSING_INVITATION_ACCEPT` marker.
- Added `previewInvitation(token)` to `HouseholdsService`: resolves invitation by SHA-256 hash, discriminates valid/expired/used/invalid states. Valid returns household name and inviter display name per D-07; terminal states return generic kind without disclosing household/inviter details.
- Added `acceptInvitation(actorId, token)` to `HouseholdsService`: loads actor canonical email from trusted server state per T-02-15, enforces D-08 email match (403 with "此邀请发给了另一个邮箱。请切换到受邀账户。"), conditional claim-once in Serializable transaction with `updateMany` guard, atomic MEMBER membership creation, P2034 retry loop (3 attempts). Already-member edge case handled idempotently.
- Changed `invitationUrl` to generate path-segment URLs (`/invite/TOKEN`) matching the Expo Router `[token].tsx` dynamic segment convention.
- Added `GET /api/v1/households/invitations/preview` (public, operationId `previewInvitation`) and `POST /api/v1/households/invitations/accept` (authenticated, operationId `acceptInvitation`) to `HouseholdsController` with DTOs `InvitationPreviewResponseDto` and `AcceptInvitationDto`. Removed class-level `@UseGuards(AccessTokenGuard)` and applied per-method for mixed public/authenticated routing.
- Created `apps/api/test/households/invitations.int.test.ts` with 9 integration test scenarios: valid/expired/used/invalidated/invalid/empty preview, matching accept, mismatch 403, duplicate 400, expired 400, concurrent exactly-one membership, invalid token 400, unauthenticated 401, cross-household acceptance.
- Updated OpenAPI generator with assertions for `previewInvitation` and `acceptInvitation` operation IDs, security requirements, and schemas. Regenerated `openapi.json` (2 new paths + 2 new schemas), `models.ts` (2 new interfaces), and `client.ts` (2 new methods: `previewInvitation` and `acceptInvitation`).
- Created `InvitationFlow` and `InvitationLanding` components: state machine covering loading, unauthenticated preview (household name + inviter + login/register buttons), matching (accept button, "这不是我的账户" link), mismatch ("此邀请发给了另一个邮箱" + switch account), terminal (invalid/expired/used with appropriate copy), accepted (success + enter household), and request_failed. No auto-accept per D-07.
- Created `apps/client/app/invite/[token].tsx` route: extracts token from Expo Router path segment, persists to sessionStorage for login round-trip, immediately sanitizes URL from `/invite/TOKEN` to `/invite`, subscribes to session state for auth transitions, maps navigation callbacks (login/register/switch-account/enter-household).
- Extended `SAFE_INTENDED_ROUTES` in `session-bootstrap.tsx` with `/invite` for post-login invitation return.
- Created `invitation-flow-test.tsx`: 8 client component tests covering loading, unauthenticated preview, authenticated accept button presence, accept flow, mismatch 403 state, invalid/expired/used terminal states.
- Completed the GREEN e2e test: removed RED marker; the test now runs through public preview, auth return, explicit accept, post-accept DB verification, mismatch suppression, and terminal states with actual assertions.
- Fixed invitation-send-slice e2e test regex to match new path-segment URL format.

## Task Commits

Each task was committed atomically in TDD order:

1. **Task 1: Activate invitation preview and accept RED contracts** - `580c16f` (test)
2. **Task 2: Implement sanitized preview auth return and atomic acceptance** - `c7f4166` (feat)

## TDD Gate Compliance

- **RED:** `580c16f` — e2e test verified preconditions (token sanitation, auth, household creation, invitation DB fixtures, preview rendering) and failed with `IMPLEMENTATION_MISSING_INVITATION_ACCEPT` via `expect.fail`.
- **GREEN:** `c7f4166` — Full implementation committed; RED marker removed from test file; the test now has concrete assertions for accept, membership creation, mismatch, and terminal states.
- **REFACTOR:** No separate refactor commit was required.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed invitation-send-slice e2e test regex for new URL format**
- **Found during:** Task 2
- **Issue:** The `invitationUrl` function was changed from `/invite?token=XXX` to `/invite/XXX` (path segment) to match the Expo Router `[token].tsx` dynamic route convention. The Plan 02-05 send e2e test had two regex assertions matching the old query-parameter format.
- **Fix:** Updated the URL format regex in invitation-send-slice.spec.ts from `/invite\?token=` to `/invite/`.
- **Files modified:** `e2e/households/invitation-send-slice.spec.ts`

**2. [Rule 3 - Blocking] Token persistence for login round-trip without URL token exposure**
- **Found during:** Task 2
- **Issue:** The D-07 immediate URL sanitization requirement conflicted with the need for the token to survive the login round-trip (navigate to login -> authenticate -> return to invite page). After sanitization, the token was no longer in the URL and would be lost when the component remounts.
- **Fix:** Added sessionStorage-based token persistence: on first load, token is saved to `window.sessionStorage` before URL sanitization. On subsequent loads (post-login return), token is restored from sessionStorage. This allows the token to survive the login round-trip while keeping it out of browser history.
- **Files modified:** `apps/client/app/invite/[token].tsx`

**3. [Rule 1 - Bug] Class-level guard prevented public preview endpoint**
- **Found during:** Task 2
- **Issue:** The `HouseholdsController` had `@UseGuards(AccessTokenGuard)` at the class level, which would apply to the new public `previewInvitation` endpoint. NestJS does not support method-level guard override of class-level guards.
- **Fix:** Removed class-level `@UseGuards(AccessTokenGuard)` and `@ApiBearerAuth()` decorators. Applied them individually to each authenticated method (`createHousehold`, `listMyHouseholds`, `getHousehold`, `updateHousehold`, `sendHouseholdInvitation`, `acceptInvitation`). The public `previewInvitation` method has no guard.
- **Files modified:** `apps/api/src/modules/households/households.controller.ts`

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: information-disclosure | apps/api/src/modules/households/households.service.ts#previewInvitation | Preview returns household name and inviter display name only for valid pending invitations; terminal states (invalid/expired/used) return generic kind without household/inviter details. |
| threat_flag: spoofing | apps/api/src/modules/households/households.service.ts#acceptInvitation | Actor email resolved from trusted AccessTokenGuard claims, compared to invitation email_canonical; request body token is untrusted. D-08: mismatch hides all invitation details. |
| threat_flag: tampering | apps/api/src/modules/households/households.service.ts#acceptInvitation | Claim-once via conditional updateMany (consumedAt IS NULL AND invalidatedAt IS NULL AND expiresAt > NOW) in Serializable isolation; P2034 retry loop prevents silent duplicate membership. |
| threat_flag: information-disclosure | apps/api/src/modules/households/households.service.ts#invitationUrl | Raw token now in URL path segment (/invite/TOKEN) per D-07; compensating controls: immediate URL sanitization, single-use 7-day expiry, hash-only persistence, sessionStorage isolation. |
| threat_flag: information-disclosure | apps/client/app/invite/[token].tsx | Token persisted in sessionStorage for login round-trip; cleared on accept success and not included in logs or network requests beyond the API payload. |

## Known Stubs

No stubs remain in this plan's deliverables. The invitation listing, resend, and revoke actions on the settings page are deferred to Plan 02-07 per the phase roadmap. The membership role governance (promotion/demotion) and ownership transfer/leave are deferred to Plan 02-07.

## Self-Check: PASSED

- All 13 files (5 created, 8 modified) exist on disk and are committed.
- RED commit `580c16f` precedes GREEN commit `c7f4166` in git history.
- Invitation-accept e2e test contains exactly one `test(...)` declaration.
- No RED marker, tracked file deletion, or untracked generated output.
- No accidental file deletions in either commit.

---
*Phase: 02-household-member-collaboration*
*Completed: 2026-08-03*
