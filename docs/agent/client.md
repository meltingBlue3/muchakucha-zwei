# Client Implementation

Read this playbook for client routing, data loading, session handling, draft state, or platform adapters. Visual and layout decisions live in [../design.md](../design.md); Web accessibility contracts live in [web-accessibility.md](web-accessibility.md). Take either one only when the change reaches it.

## Routes

Expo Router maps `apps/client/app/` to the route tree. `(auth)` and `(protected)` are layout groups and do not appear in URLs; `[id]`, `[taskId]`, and siblings are path parameters. A route file owns orchestration — parameters, fetching, navigation, and page composition — and delegates domain rendering to `src/features/` and appearance to `src/ui/`.

Standalone member-governance confirmations use routes, as in `members/[membershipId]/remove.tsx`, `ownership/transfer.tsx`, and `invitations/[invitationId]/revoke.tsx`. Editor steps and confirmations stay inside the existing `RouteWindow`; use its step/confirmation mechanism rather than adding another modal or route for each step.

Resource windows retain the background list, filters, selected date, and scroll position. Direct links reconstruct a base page and close to the resource list when there is no history. Shared window handling owns browser/system back, busy-state close suppression, and focus restoration; when a trigger disappears, restore a stable list entry point.

## Loading data

Every authenticated call takes the access token as its first argument:

```ts
const token = await sessionTransport.getAccessToken();
if (token === null) { setError('登录已过期，请重新登录。'); return; }
const result = await sessionApiClient.listNotes(token, householdId);
```

Both come from `src/features/auth/session-runtime.ts`. Routes hold `loading`, `refreshing`, and `error` in local state and refetch through `useFocusEffect` so returning from a child route shows current data. `@tanstack/react-query` is installed but unused — follow the local-state pattern above instead of introducing a second data layer for one screen.

Failures reach the user as copy in the interface language describing the next action, never a raw status or code; the API's own `message` is never shown. `src/api/api-client.ts` shows the shape of a rejected call (`status` plus a body carrying `error.code`) and how `SessionRestoreError` classifies authentication failures into `unauthenticated`, `reauthRequired`, and `offline`.

## Interface text

The interface is written in Chinese and Japanese, and each device chooses its own language. [src/i18n/index.ts](../../apps/client/src/i18n/index.ts) owns the choice and the i18next instance; the catalogs live in `src/i18n/locales/`, one namespace per feature.

- `zh.ts` is the source. `ja.ts` is typed against it, so a missing or extra key fails the typecheck. Add a string to both in the same change.
- A component takes `useTranslation` from `src/i18n`, never from `react-i18next`: importing it there loads the catalogs, and the hook re-renders the component when the language changes.
- A helper outside React reads `i18n.t`, as `src/ui/date-values.ts` does for dates and weekdays. A component that shows such a helper's result still calls `useTranslation`, or it keeps the old language until something else re-renders it.
- Dates people read go through `date-values.ts`; do not assemble 「月」「日」「周」 by hand.
- A language's own name (中文, 日本語) is not translated. Everything else a person reads or hears is, accessibility names included.
- The choice is read synchronously before the first render, from `platform/preferences/language`, and defaults to the system's preferred language through `expo-localization`. A system language the interface is not written in falls back to Chinese, which is why Jest and Playwright, both in English, still read Chinese.
- Every page reads both languages; [i18n-migration.md](../i18n-migration.md) lists the work left outside the pages. Text the app writes into the database stays in its writer's language, so prefer storing a kind and naming it when shown. A birthday's title is the one such text the family chose to keep: it is written once in the language of whoever adds the birthday, and is theirs to edit.

## Session and household

`sessionTransport` keeps the access token in memory and holds the refresh credential in SecureStore on native and an HttpOnly cookie on Web. `src/api/refresh-coordinator.ts` collapses concurrent refreshes into one. Neither the token nor the refresh credential is logged, persisted to component state, or passed through navigation parameters.

`useHouseholdContext()` owns the current household. Its `viewState` — `resolving`, `ready`, `noHousehold`, `offlineRetained`, `accessChanged` — drives what a protected screen renders; a screen that only checks for an empty list will show a blank page during resolution and after access loss. Use `AccessChangedPanel` for the `accessChanged` state and `switchHousehold`/`refreshHouseholds` for transitions rather than re-fetching households directly.

## Drafts

`useWorkspaceState(draftKey, initial)` keeps drafts under `draft:<householdId>:<resource>:<id-or-new>:<field>`. `workspace-store.ts` persists dirty draft fields per authenticated account through `platform/drafts/`; Web uses localStorage and native uses files. Filters and view state remain in memory. Restoration is synchronous before protected forms mount; keep values JSON-compatible. A form keeps its draft across cancel and restart, clears its whole prefix after successful save, and uses `DraftNotice` for explicit discard and persistence failure feedback. `NoteForm` is the reference implementation.

Only what the person changed is a draft: `hasDrafts` decides whether a pane asks before switching items, so opening an editor must leave it false. Seed an edit form's starting values with `workspace.seed`, already normalized the way its fields would normalize them (the rule editor moves the start to tomorrow before seeding); a `set` or a field's sync `onChange` on mount marks the form changed. The `baseVersion` / `baseRuleVersion` records that `edit-conflict.tsx` writes on open are bookkeeping: they never count as a change and are persisted only beside a real one.

`session-runtime.ts` activates the account store and clears it on sign-out or a revoked or replayed session; an expired session only detaches it, so the same account finds its drafts after signing in again. `household-context.tsx` prunes drafts only after an authoritative membership response or known access loss; a failed/offline request does not justify deleting drafts. Preserve the partial-create record used by `useCreateWithLabels`, so a restart retries labels without creating duplicate content.

Updates omit unchanged fields, so clearing an optional value requires sending it explicitly. `note-form.tsx` sends `body: ''` when editing an existing note and omits `body` when creating — the analogous case in any edit form needs the same explicit empty value plus a unit test on the submitted payload.

## Platform adapters

`src/platform/<area>/` holds one base file declaring the shared type and `.native.ts` / `.web.ts` / `.android.ts` implementations that Metro selects by extension. Platform branching belongs there, not in features or routes. `Platform.OS` checks inside a shared component are for rendering differences a type cannot express, such as the Web dialog naming in `src/ui/app-dialog.tsx`.

## Voice input

[use-assistant-voice-input.ts](../../apps/client/src/features/assistant/use-assistant-voice-input.ts) owns the attempt lifecycle; [platform/voice](../../apps/client/src/platform/voice/) owns recording and file access.

- A cancelled attempt's late permission, recording, or transcription result cannot modify the draft. Only append a successful transcript after checking the combined message length; never auto-send or silently truncate it.
- Leaving the page or losing access discards recording; backgrounding or a call during recording submits the captured portion. Ignore background events while merely opening the microphone: Android permission UI itself can produce them.
- Release microphone tracks, temporary files, and Blob URLs on success, cancellation, and departure. Audio is transient, not draft data. Native permissions and recording configuration belong to the platform layer.
- Web needs HTTPS or localhost for the microphone. Native recording formats, interruptions, and actual transcription acceptance require device evidence; pending checks live in the [roadmap](../roadmap.md#待验收).

## Local reminders

[reminder-sync.ts](../../apps/client/src/features/reminders/reminder-sync.ts) reconciles the server plan with device registrations. Startup, foreground return, changes to the interface language or households, and relevant successful writes request a sync.

- Reconciliation is idempotent and serialized, with one follow-up run for changes received during a run. Offline failure preserves existing registrations. Only reminder-owned identifiers may be cancelled; content and delivery changes must replace obsolete registrations.
- Sign-out and revoked/replayed sessions clear scheduled notifications, alarms, snoozes, and active ringing; ordinary expiry preserves them. Stable server keys identify recurring occurrences before and after materialization.
- Notification taps and cold-start responses open content once. A future occurrence without an instance opens the household's Today page.
- Keep runtime SDK imports inside [local-notifications.ts](../../apps/client/src/platform/reminders/local-notifications.ts). It avoids package-root remote-push modules unavailable in some runtimes; verify its SDK subpaths on upgrades. Shared native/Web types belong in a separate module to avoid Metro resolving a platform import back to itself.
- [reminder-alarm](../../apps/client/modules/reminder-alarm/) implements Android ringing and snooze. Snoozes stay outside regular reconciliation but participate in cancel-all; expired registrations are removed without catch-up ringing. Missing alarm support falls back to ordinary notifications. Native module changes require a new binary.
- Platform limits and the local-only scheduling tradeoff live in the [development guide](../development.md#提醒与闹铃); pending hardware verification lives in the [roadmap](../roadmap.md#待验收).

## Focused checks

Client unit tests are Jest, run from the client package:

```sh
pnpm --filter client test                          # whole suite, parallel workers
pnpm --filter client exec jest <path-or-pattern>   # one file or a subset
```

Keep `jest` and `@types/jest` on the major that `jest-expo` is built on (29 today); a newer Jest breaks every suite through the React Native test environment. Test files must be named `src/**/__tests__/*-test.tsx`; any other name matches no pattern and silently runs zero tests. Add `pnpm --recursive typecheck` for type-level changes, and see [testing.md](testing.md) when a change needs browser evidence.
