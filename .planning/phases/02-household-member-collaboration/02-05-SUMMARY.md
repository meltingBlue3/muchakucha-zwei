---
phase: 02-household-member-collaboration
plan: 05
subsystem: api-client-e2e
tags: [nestjs, prisma, openapi, api-client, react, household-invitation, mail, e2e, settings]

requires:
  - plan: 02-04
    provides: household-settings component with rename, D-12 accessChanged, PATCH /:id updateHousehold, generated OpenAPI pipeline
provides:
  - Invitation model with household/inviter FKs, canonical email, SHA-256 hash, server-fixed MEMBER role, 7-day expiry
  - 0003_household_invitations migration with partial unique index for pending invitations
  - POST /api/v1/households/:id/invitations sendHouseholdInvitation endpoint
  - SendHouseholdInvitationDto / SendHouseholdInvitationResponseDto DTOs (exported from controller per scope exception)
  - Owner/admin guard, already-member 409 rejection, transactionally-rotated predecessor invalidation
  - HouseholdInvitationMail mail port with recipient/inviteURL/inviter/household/expiry mapping
  - SMTP adapter contract test asserting full invite payload mapping
  - Generated typed sendHouseholdInvitation client operation
  - household-settings.tsx invitation form: email field, HouseholdContextNote, owner/admin-only, polite live region
  - Privacy-preserving D-06 identical UI response for registered/absent/repeated non-members
  - 1 e2e test covering owner/admin/member/outsider auth, mailbox, DB hash/rotation/role, and privacy matrix
affects: [invitation-flow, member-governance]

tech-stack:
  added: []
  patterns:
    - "sendHouseholdInvitation derives actor membership fresh inside target household; checks owner/admin per D-09; role is server-fixed MEMBER per D-05"
    - "Predecessor rotation: transactionally invalidates existing pending invitation for same household+canonical-email before creating new"
    - "Commit-before-mail: raw token sent only via SMTP after database commit; hash-only in persistence"
    - "D-06 privacy: identical 201 { code: 'INVITATION_SENT', message: '邀请已发送。' } for registered, absent, and repeated non-member recipients"
    - "Send-only DTOs exported from households.controller.ts per Plan 02-05 scope exception"
    - "Invitation form permission-check: only owner/admin see the email field and send button; member never sees the action"

key-files:
  created:
    - apps/api/prisma/migrations/0003_household_invitations/migration.sql
    - e2e/households/invitation-send-slice.spec.ts
  modified:
    - apps/api/prisma/schema.prisma
    - apps/api/src/modules/households/households.controller.ts
    - apps/api/src/modules/households/households.service.ts
    - apps/api/src/infrastructure/mail/mail.port.ts
    - apps/api/src/infrastructure/mail/smtp-mail.adapter.ts
    - apps/api/src/infrastructure/mail/smtp-mail.adapter.test.ts
    - apps/api/src/openapi/generate-openapi.ts
    - packages/api-client/openapi.json
    - packages/api-client/src/generated/models.ts
    - packages/api-client/src/generated/client.ts
    - apps/client/src/features/households/household-api.ts
    - apps/client/src/features/households/household-settings.tsx
    - apps/client/app/(protected)/households/[id]/settings.tsx

key-decisions:
  - "Invitation role is server-fixed to MEMBER per D-05; the DTO has no role field and the service hardcodes 'MEMBER' in the create call."
  - "Partial unique index on (household_id, email_canonical) WHERE invalidated_at IS NULL AND consumed_at IS NULL enforces at most one active pending invitation per household+email."
  - "Invitation hash is lowercase SHA-256 hex; raw 32-byte CSPRNG token is delivered only in the SMTP message after database commit."
  - "Send-only DTOs (SendHouseholdInvitationDto, SendHouseholdInvitationResponseDto) are exported from households.controller.ts rather than a separate dto/invitation.dto.ts per the Plan 02-05 scope exception."
  - "Controller distinguishes already-member (409 ALREADY_MEMBER) from non-member success (201 INVITATION_SENT), and non-member/non-inviter (403 INSUFFICIENT_ROLE) from outsider (404 HOUSEHOLD_NOT_FOUND)."

patterns-established:
  - "Privacy-preserving invitation: canonical email normalization -> owner/admin guard -> transactional predecessor rotation -> commit -> post-commit mail -> identical D-06 UI response"
  - "Mail boundary extension: typed HouseholdInvitationMail message maps recipient, invitation URL with raw token, inviter display name, household display name, and expiry; SMTP adapter test asserts all five fields in text and HTML"

requirements-completed: [HHLD-02, EXPR-02, SAFE-01, SAFE-02]

duration: 35min
completed: 2026-08-03
status: complete

estimate:
  tokens: 12000
  tasks: 2
  commits: 2
actuals:
  tokens: 18500
  tasks: 2
  commits: 2
---

# Phase 02 Plan 05: Invitation Send from Real Settings Slice Summary

**Privacy-preserving household invitation sent from the real settings UI through committed PostgreSQL state and post-commit SMTP delivery, with D-05 server-fixed MEMBER role and D-06 identical response for all non-member recipients.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-08-03T16:00:00Z
- **Completed:** 2026-08-03T16:35:00Z
- **Tasks:** 2
- **Files modified:** 15 files (2 created, 13 modified)

## Accomplishments

- Created the RED contract: `e2e/households/invitation-send-slice.spec.ts` with exactly one Playwright test `sends a privacy-preserving invitation from settings [RED:INVITATION_SEND]`, verifying auth, household creation, roster, /households selector, and settings route preconditions before the `IMPLEMENTATION_MISSING_INVITATION_SEND` marker.
- Added `Invitation` model to Prisma schema with `householdId`/`inviterUserId`/`inviterMembershipId` FKs, `emailCanonical`, lowercase SHA-256 `hash`, server-fixed `role`='MEMBER', 7-day `expiresAt`, and terminal-state `invalidatedAt`/`consumedAt` columns.
- Created `0003_household_invitations` migration with partial unique index `Invitation_household_email_pending_idx` on `(household_id, email_canonical) WHERE invalidated_at IS NULL AND consumed_at IS NULL`, hash unique constraint, expiry-after-creation check, role='MEMBER' check, and three foreign keys.
- Extended `MailPort` with `HouseholdInvitationMail` interface carrying `invitationUrl`, `inviterDisplayName`, `householdDisplayName`, and `expiresAt`.
- Added `sendHouseholdInvitation` to `SmtpMailAdapter` composing Chinese text/HTML email with inviter, household, invitation URL, and ISO 8601 expiry.
- Extended `smtp-mail.adapter.test.ts` with a dedicated test asserting: recipient mapping (`friend@example.test`), subject containing inviter and household, plain-text URL/token presence, HTML escaped content, and token-isolation across messages.
- Added `sendHouseholdInvitation(actorId, householdId, email)` to `HouseholdsService`: canonical email validation via `class-validator`, household+membership resolution, owner/admin guard (403), already-member guard (409), 32-byte CSPRNG token generation, SHA-256 hash, transactional predecessor rotation with `Serializable` isolation, and commit-before-mail delivery. Identical `{ code: 'INVITATION_SENT', message: '邀请已发送。' }` response for registered, absent, and repeated non-members per D-06.
- Added `POST /api/v1/households/:id/invitations` (operationId `sendHouseholdInvitation`) to the controller with `SendHouseholdInvitationDto` and `SendHouseholdInvitationResponseDto` exported inline per Plan 02-05 scope exception. Uses `@ApiCreatedResponse`, `@ApiBadRequestResponse`, `@ApiConflictResponse`, `@ApiForbiddenResponse`, `@ApiNotFoundResponse`, and `@ApiBearerAuth`.
- Updated the OpenAPI generator with assertions for `sendHouseholdInvitation` operationId, security, and both DTO schemas. Regenerated `openapi.json` (endpoint + schemas), `models.ts` (two new interfaces), and `client.ts` (typed `sendHouseholdInvitation` method).
- Extended `HouseholdApi` type to include `sendHouseholdInvitation`.
- Extended `household-settings.tsx` with an invitation form: email `TextField`, `HouseholdContextNote` destination display, privacy notice ("对方可通过邮件登录或创建账户后接受邀请。"), owner/admin-only visibility via `isCurrentUser` role check, `sendHouseholdInvitation` call via `HouseholdSettingsApi`, success feedback with polite `accessibilityLiveRegion`, cleared email field on success, duplicate-lock during submission, already-member error display, 403/404/401 error handling, and `onInviteAccessChanged` D-12 callback.
- Wired `showInvite` and `onInviteAccessChanged` props through `/households/[id]/settings.tsx` route.
- Completed the invitation-send e2e test: owner sends invitation to outsider via UI, verifies success feedback, verifies email field cleared, inspects Mailpit for delivered message with recipient/inviter/household/URL/expiry, verifies database hash is lowercase SHA-256, verifies raw token absent from database, verifies role is MEMBER and invitation is not consumed/invalidated, repeats invitation to same recipient and verifies predecessor rotation (invalidated), sends to already-member and verifies 409 rejection, sends to registered non-member and verifies identical D-06 success, verifies member 403 rejection via API, verifies outsider 404 rejection via API, and verifies admin can send via API.

## Task Commits

Each task was committed atomically in TDD order:

1. **Task 1: Establish the dedicated end-to-end invitation-send RED contract** - `2d45c50` (test)
2. **Task 2: Make the real settings-to-mail invitation journey green** - `5a80c1e` (feat)

## TDD Gate Compliance

- **RED:** `2d45c50` -- e2e test verified preconditions (auth, createHousehold, listMyHouseholds, /households selector, settings route, roster loading) and failed with `IMPLEMENTATION_MISSING_INVITATION_SEND` via `expect.fail`.
- **GREEN:** `5a80c1e` -- Full implementation committed; RED marker removed from test file; the test now has concrete API, UI, Mailpit, and database assertions.
- **REFACTOR:** No separate refactor commit was required.

## Deviations from Plan

None -- plan executed exactly as written. The 15-file count (14 plan files plus e2e test) stays within the 15-file blocker limit via the scope exception documented in the plan.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: trust-boundary | apps/api/src/modules/households/households.service.ts#sendHouseholdInvitation | Actor membership and invitation authorization resolved from AccessTokenGuard claims; email from DTO is untrusted and canonicalized; owner/admin check prevents member/outsider send. |
| threat_flag: information-disclosure | apps/api/src/modules/households/households.service.ts | Identical response for registered, absent, and repeated non-members per D-06; server-fixed MEMBER role prevents role escalation via invitation. |
| threat_flag: tampering | apps/api/src/modules/households/households.service.ts | Transactional predecessor rotation with Serializable isolation; commit-before-mail prevents mail on rollback; partial unique index prevents concurrent pending duplicates. |
| threat_flag: information-disclosure | apps/api/src/infrastructure/mail/smtp-mail.adapter.ts | Raw invitation token exists only in the delivered email URL; hash-only in persistence, response DTOs, and logs. |

## Known Stubs

No stubs remain in this plan's deliverables. The invitation acceptance flow (accepting invitations, creating membership on accept) is deferred to Plan 02-07 per the phase roadmap. The invitation listing, resend, and revoke actions on the settings page are deferred to Plan 02-07.

## Self-Check: PASSED

- All 15 files (2 created, 13 modified) exist on disk and are committed.
- RED commit `2d45c50` precedes GREEN commit `5a80c1e` in git history.
- Invitation-send e2e test contains exactly one `test(...)` declaration.
- No RED marker, tracked file deletion, or untracked generated output.
- No accidental file deletions in either commit.
- All 15 files match the plan's `files_modified` list plus the e2e test file.

---
*Phase: 02-household-member-collaboration*
*Completed: 2026-08-03*
