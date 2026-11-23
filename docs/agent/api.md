# API Implementation

Read this playbook when changing an endpoint, DTO, error code, permission rule, Prisma schema, or migration. It covers the contracts a server change must keep; test selection lives in [testing.md](testing.md).

## Request and response contracts

There are no legacy clients to support. Change `/api/v1` and the current client together when a product rule requires it; regenerate the contract and update callers instead of adding compatibility bypasses. Edit versions are mandatory for tasks, notes, events, and recurrence rules. Recurring occurrence edits also require the rule version. Deletes take the same versions as optional query parameters (labels: name and colour), and a label edit sends that name and colour in its body. The current client always sends them; an unversioned delete or label edit stays unchecked only until installed app builds from before the check are replaced. Adding `recurrence` to a one-time task or event turns it into the first occurrence of a new series.

`apps/api/src/main.ts` fixes the shapes every module inherits:

- Errors are `{ error: { code, message, details?, retryAfterSeconds? }, requestId }`. Reading `body.code` finds nothing — the code sits at `body.error.code`, in tests as well as in client code.
- A service raises a typed failure by passing a structured body: `throw new NotFoundException({ code: 'NOTE_NOT_FOUND', message: 'Note not found.' })`. Without that body the filter falls back to a generic code derived from the status.
- `ValidationPipe` runs with `whitelist`, `forbidNonWhitelisted`, `forbidUnknownValues`, and `transform`. Failures become `400 VALIDATION_FAILED` with `details` listing each field and its constraint names.
- `/api/v1/auth/*` accepts only `POST` and `OPTIONS`; anything else is rejected with `405 METHOD_NOT_ALLOWED` before routing.
- Logs redact authorization headers, cookies, URLs, and any `password`, `token`, `refreshToken`, or `pendingProof` field. New sensitive fields join that redaction list in the same change.

Every DTO property carries a `class-validator` decorator, and array properties validate their element type with `{ each: true }`. An undecorated property is not merely unvalidated: a value of the wrong shape reaches the service and surfaces as a 500 instead of a 400.

## Rate limits

A global throttler allows 60 requests per minute per client. Authentication routes tighten this per route with `@Throttle`, down to 5 per hour for registration.

Counting is per client address, so a deployment behind a reverse proxy sets `TRUST_PROXY` to the proxy's own address — without it every caller shares one quota. The variable takes explicit IPs or CIDR ranges only; `true` and hostnames fail at startup, since trusting any upstream would let a caller forge `X-Forwarded-For` and mint a fresh quota.

The limiter is bypassed only when `NODE_ENV=test` and `E2E_DISABLE_RATE_LIMITS=true`. A test suite that issues many requests sets both in the app environment; one that does not will start seeing `429 RATE_LIMITED` partway through and fail in a way that looks like a logic bug.

## Permissions

Authorization is a server property. Client guards and hidden buttons are convenience, never the boundary.

Every household-scoped handler resolves the caller's membership first. A caller who is not a member receives `404 HOUSEHOLD_NOT_FOUND`, and a resource belonging to another household receives that resource's own not-found code — existence is not disclosed to a non-member. A member who is authenticated and in scope but lacks the role for an action receives `403 FORBIDDEN`. Follow `src/modules/notes/notes.service.ts` for the ordering of these checks.

The 总览 (`src/modules/overview/`) reads across households without widening access: it resolves the caller's current memberships first and passes only those household ids to `EventsService.listAcross` / `TasksService.listAcross`, which check no membership themselves and must not be called with ids from a request. Each membership's `inOverview` is the member's own choice; when none is chosen, every household counts as chosen, and `GET /households` reports that effective value. Writes always go through each household's own routes.

`src/modules/households/household-policy.ts` holds the governance decisions as pure functions — role change, removal, ownership transfer, owner leave — so services and integration tests share one source. Extend those functions rather than re-deciding a rule inside a service, and keep the staleness, cross-household, and foreign-key checks in the service where the database is available.

## Schema and data

- Schema changes ship with a migration in `apps/api/prisma/migrations/`. Integration setup runs `prisma migrate deploy`, so an uncommitted schema edit fails the suite rather than silently drifting.
- Preserve database constraints and transactions. A rule the database can enforce is enforced there as well as in the service.
- Time points are `timestamptz` in UTC. Calendar dates and recurrence time zones are distinct concepts and stay distinct in the schema, the DTO, and the client.
- Prisma models stay inside the API. Controllers return DTOs; `src/generated/prisma/` is generated output.
- A yearly rule may repeat on a lunar month and day (`recurrence.lunar`). The anchor is part of how the rule repeats, so a request without it repeats on Gregorian dates; the first occurrence is the first lunar date on or after `startsOn`. `occasion` (`birthday`) and `birthYear` describe the series instead: an edit that omits them keeps the rule's, and `null` clears them. [series-marks.ts](../../apps/api/src/modules/recurrence/series-marks.ts) resolves both, and database CHECKs enforce the same combinations.
- A series' labels belong to its rule (`recurrence_rule_labels`), like its `template_*` fields: generated occurrences copy them, an edit to one occurrence relabels that row only, and a series edit writes the successor rule's labels. Assignees have no rule template yet and still come from an instance row.
- Refresh credentials are stored as hashes only (`RefreshToken.tokenHash`). Invitations are account-bound inbox records: every list/response checks the authenticated recipient; an invitation ID alone grants no access.

## Assistant

The assistant keeps protocol conversion, bounded execution, and business actions separate. This follows the [ReAct loop](https://arxiv.org/abs/2210.03629); model choice does not change authorization or CRUD semantics.

- [assistant-provider.ts](../../apps/api/src/modules/assistant/assistant-provider.ts) owns provider protocols. Preserve opaque reasoning fields, signatures, and tool-call IDs required for subsequent requests; these belong to replay state, not visible answer text. Verify a complete tool round trip for each protocol.
- [assistant.service.ts](../../apps/api/src/modules/assistant/assistant.service.ts) owns execution and confirmation; [assistant-context.ts](../../apps/api/src/modules/assistant/assistant-context.ts) builds bounded model context from fuller stored history. Read budget values from code. The run budget is checked at call boundaries, so an in-flight request may exceed it; keep per-request timeouts as well.
- [assistant-tools.service.ts](../../apps/api/src/modules/assistant/assistant-tools.service.ts) injects authenticated user and household context, validates parameters, and reuses domain services. Tools expose business actions, never arbitrary SQL, scripts, URLs, or caller-selected actor IDs.
- Lunar dates, festivals, and solar terms reach the model only through tools that use `packages/lunar` (`lunar_calendar`, `find_lunar_dates`); each user message's time prefix carries today's lunar date. `list_recurring_series` computes each series' next date and birthday age from the rule, so reads never generate occurrences. A proposed series moves to the rule's first occurrence, because the events service keeps only the start time of day and the length.
- `japanese_holidays` and `japanese_era_dates` use `packages/wareki`, the same rules as the app calendar. The holiday tool includes substitute and citizens’ holidays and can calculate days from a reference date. The era tool converts Gregorian dates using the day of each era change. Japanese equinox holidays use Japan’s calendar day, which can differ from the Chinese solar term returned by the lunar tools.
- Writes become concrete proposals bound to user, household, parameters, and versions. Confirmation is consumed once, writes run serially, and partial success is reported per action. An edit conflict requires a fresh read and proposal, not replay against a silently updated version.
- Provider sharing grants invocation only. Changing the destination or protocol invalidates continuation of old conversations; revoking sharing, membership, or configuration blocks subsequent use and pending confirmation.
- Treat family content, provider responses, and upstream errors as untrusted data. Credentials stay encrypted on the server; logs retain bounded diagnostics and identifiers, not prompts, raw upstream bodies, or audio. The outbound transport supports HTTP and HTTPS, validates and pins public addresses, and refuses redirects. See [OWASP SSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).
- Conversation requests carry the device interface language in Accept-Language. The Chinese system prompt asks the model to use the language the user requests or writes in, with the interface language as fallback. Tool results keep their original data and terminology. The API returns a null title for an empty conversation so the client can name it in the current language.
- Transcription reuses provider ownership, encryption, sharing, transport, and usage accounting. Chat and transcription purposes are isolated. The transcription request uses Accept-Language to select Chinese or Japanese recognition. Audio passes through API memory without storage; response limits and accepted formats live in the transcription implementation and DTOs.

## Personal reminders

[reminders.service.ts](../../apps/api/src/modules/reminders/reminders.service.ts) and [reminder-schedule.ts](../../apps/api/src/modules/reminders/reminder-schedule.ts) share recipient and timing rules across server push and device schedules.

- Settings and overrides belong to the caller. Returning to default deletes an override. Reminder changes neither require nor change the content edit version; assistant tools omit personal `myReminder` data.
- An override on recurring content belongs to its rule and applies to every occurrence. Splitting a rule copies each user's override to the new rule.
- The plan must include unmaterialized upcoming occurrences. Derive them after `materializedThrough`, but exclude dates with any existing instance row, including cancelled or completed rows. Stable rule/date keys survive materialization so the same occurrence cannot be scheduled twice.
- Date-only reminders use the person's configured local reference time in the request time zone, not a default lead time subtracted from UTC midnight. Closed household switches, disabled defaults, and explicit overrides all participate in the server calculation.
- Alarm choice is independent of timing. An off reminder has no alarm override; the plan resolves defaults before returning `alarm` to the device. User-facing limitations live in the [development guide](../development.md#提醒与闹铃).
- [reminder-push.service.ts](../../apps/api/src/modules/reminders/reminder-push.service.ts) recomputes due reminders for active registered sessions and claims each device and occurrence time once. Registrations select Expo, direct Firebase Cloud Messaging, or Web Push. Expo receipts, FCM `UNREGISTERED`, and Web Push `404` or `410` retire invalid registrations. Expired and revoked sessions cannot receive new pushes. A device with native alarms keeps its ringing reminders local.
- Web Push stores the subscription endpoint and encryption keys with the session. Use the same [endpoint allowlist](../../apps/api/src/modules/reminders/web-push-subscription.ts) at registration and before sending. Allow HTTPS without user info or a port on `fcm.googleapis.com`, `*.notify.windows.com`, `web.push.apple.com`, and `updates.push.services.mozilla.com`. Send with redirects disabled. [ADR 0001](../adr/0001-web-push-reminders.md)

## Regenerating the contract

Update the DTOs and templates in `apps/api/src/openapi/generate-openapi.ts`, then:

```sh
pnpm openapi:generate   # rewrites packages/api-client
pnpm openapi:check      # regenerates and fails on any diff against HEAD
```

`packages/api-client/` is generated in full, including `openapi.json` and `src/generated/`. Editing it by hand produces a change that the next generation silently discards, and `openapi:check` compares against `HEAD`, so a regenerated client is committed together with the server change.
